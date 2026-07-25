/* eslint-disable no-restricted-globals */
/**
 * Service Worker
 *  1. アプリシェルをキャッシュしてオフライン起動できるようにする
 *  2. 他アプリの共有メニューから送られた PDF を IndexedDB へ預かる
 *
 * キャッシュ戦略:
 *  - ナビゲーション: ネットワーク優先 → 失敗したらキャッシュ (オフライン起動)
 *  - 静的アセット: キャッシュ優先 → 無ければ取得して保存
 */

const CACHE_VERSION = 'v1';
const CACHE_NAME = `pdf-folder-${CACHE_VERSION}`;
const APP_SHELL = [
  '/',
  '/manifest.webmanifest',
  '/pdf.worker.min.mjs',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-180.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        // 1 つでも失敗するとインストール全体が止まるため、個別に握りつぶす
        Promise.all(
          APP_SHELL.map((url) => cache.add(url).catch(() => undefined)),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

/* ------------------------------------------------------------------ */
/* 共有メニューからの受け取り                                          */
/* ------------------------------------------------------------------ */

const DB_NAME = 'pdf-folder-manager';
const DB_VERSION = 1;
const INBOX_STORE = 'share_inbox';

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      // アプリ側と同じ構成を作る (SW が先に開いた場合の保険)
      if (!db.objectStoreNames.contains('folders')) {
        const folders = db.createObjectStore('folders', { keyPath: 'id' });
        folders.createIndex('parentId', 'parentId');
        folders.createIndex('deletedAt', 'deletedAt');
      }
      if (!db.objectStoreNames.contains('files')) {
        const files = db.createObjectStore('files', { keyPath: 'id' });
        files.createIndex('parentId', 'parentId');
        files.createIndex('deletedAt', 'deletedAt');
        files.createIndex('updatedAt', 'updatedAt');
      }
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('thumbs')) db.createObjectStore('thumbs', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('settings'))
        db.createObjectStore('settings', { keyPath: 'key' });
      if (!db.objectStoreNames.contains(INBOX_STORE))
        db.createObjectStore(INBOX_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeSharedFiles(files) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(INBOX_STORE, 'readwrite');
    const store = transaction.objectStore(INBOX_STORE);
    files.forEach((file, index) => {
      store.put({
        id: `share-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name || 'shared.pdf',
        blob: file,
        receivedAt: new Date().toISOString(),
      });
    });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  db.close();
}

async function handleShareTarget(event) {
  try {
    const formData = await event.request.formData();
    const files = formData
      .getAll('files')
      .filter((entry) => entry && typeof entry === 'object' && 'name' in entry);
    if (files.length > 0) await storeSharedFiles(files);
  } catch {
    /* 受け取りに失敗してもアプリは開く */
  }
  return Response.redirect('/?shared=1', 303);
}

/* ------------------------------------------------------------------ */
/* fetch                                                               */
/* ------------------------------------------------------------------ */

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(handleShareTarget(event));
    return;
  }

  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/', clone));
          return response;
        })
        .catch(() => caches.match('/').then((cached) => cached ?? caches.match(request))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
    }),
  );
});
