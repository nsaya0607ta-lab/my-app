'use client';

/**
 * IndexedDB全体をZIP化し、Firebase Storageへ保存・復元する。
 *
 * - 最新バックアップは1日1ファイル（同じ日は上書き）
 * - 過去30日分をスナップショットとして保持
 * - Firestoreには最新ファイルの場所・日時・件数だけを保存
 * - PDF本体はStorageだけに置き、Firestoreの1MiB上限へ入れない
 */
import { createBackup } from './backup';
import { loadAll } from './db';
import { getFirebaseCloudServices, currentCloudUser } from './firebaseCloud';
import type { Folder, PdfFileMeta, Settings } from './types';

const CLOUD_STATE_KEY = 'pdf-folder-cloud-backup-state-v1';
export const CLOUD_STATE_EVENT = 'pdf-folder-cloud-backup-state';
const SNAPSHOT_RETENTION_DAYS = 30;

export type CloudBackupLocalState = {
  lastAt?: string;
  lastSignature?: string;
  lastError?: string;
};

export type CloudBackupMetadata = {
  latestPath: string;
  updatedAt: string;
  size: number;
  fileCount: number;
  folderCount: number;
};

let runningBackup: Promise<CloudBackupMetadata> | null = null;

function emitState(state: CloudBackupLocalState) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CLOUD_STATE_KEY, JSON.stringify(state));
  } catch {
    // localStorageが使えなくてもクラウド保存自体は継続する。
  }
  window.dispatchEvent(new CustomEvent(CLOUD_STATE_EVENT, { detail: state }));
}

export function readCloudBackupLocalState(): CloudBackupLocalState {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(CLOUD_STATE_KEY) || '{}') as CloudBackupLocalState;
  } catch {
    return {};
  }
}

function jstDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function backupRoot(uid: string) {
  return `users/${uid}/pdf-backup`;
}

function metadataRef(firestore: any, uid: string) {
  return firestore.collection('users').doc(uid).collection('pdfBackups').doc('state');
}

/** 自動バックアップが「意味のある変更」だけを検出するための署名。 */
export async function createBackupSignature(
  folders: Folder[],
  files: PdfFileMeta[],
  settings: Settings,
): Promise<string> {
  const folderRows = folders
    .map((folder) => ({
      id: folder.id,
      parentId: folder.parentId,
      name: folder.name,
      color: folder.color,
      favorite: folder.isFavorite,
      order: folder.sortOrder,
      updatedAt: folder.updatedAt,
      deletedAt: folder.deletedAt,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const fileRows = files
    .map((file) => ({
      id: file.id,
      parentId: file.parentId,
      name: file.name,
      size: file.size,
      pageCount: file.pageCount,
      tags: [...(file.tags || [])].sort(),
      memo: file.memo,
      importance: file.importance,
      favorite: file.isFavorite,
      read: file.isRead,
      order: file.sortOrder,
      updatedAt: file.updatedAt,
      deletedAt: file.deletedAt,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  // 自動バックアップのON/OFF自体は内容変更として数えない。
  const { cloudBackupEnabled: _cloudBackupEnabled, ...backupSettings } = settings;
  const source = JSON.stringify({ folders: folderRows, files: fileRows, settings: backupSettings });

  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  // 古いWebView向けの簡易フォールバック。
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fallback-${(hash >>> 0).toString(16)}`;
}

async function pruneOldSnapshots(storage: any, uid: string) {
  const cutoff = new Date(Date.now() - SNAPSHOT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const cutoffKey = jstDateKey(cutoff);
  const folderRef = storage.ref(`${backupRoot(uid)}/snapshots`);
  const result = await folderRef.listAll();
  const old = result.items.filter((item: any) => {
    const match = String(item.name).match(/^(\d{4}-\d{2}-\d{2})\.zip$/);
    return !!match && match[1] < cutoffKey;
  });
  await Promise.allSettled(old.map((item: any) => item.delete()));
}

async function performBackup(settings: Settings, signature?: string): Promise<CloudBackupMetadata> {
  const user = await currentCloudUser();
  if (!user) throw new Error('クラウドバックアップへログインしてください。');

  const { firestore, storage } = await getFirebaseCloudServices();
  const { blob } = await createBackup(settings);
  const dateKey = jstDateKey();
  const path = `${backupRoot(user.uid)}/snapshots/${dateKey}.zip`;
  const updatedAt = new Date().toISOString();

  const snapshot = storage.ref(path);
  await snapshot.put(blob, {
    contentType: 'application/zip',
    customMetadata: {
      app: 'pdf-folder-manager',
      uid: user.uid,
      backedUpAt: updatedAt,
    },
  });

  const localData = await loadAll();
  const meta: CloudBackupMetadata = {
    latestPath: path,
    updatedAt,
    size: blob.size,
    fileCount: localData.files.length,
    folderCount: localData.folders.length,
  };

  await metadataRef(firestore, user.uid).set(meta, { merge: true });
  await pruneOldSnapshots(storage, user.uid).catch(() => undefined);

  emitState({ lastAt: updatedAt, lastSignature: signature });
  return meta;
}

export async function uploadCloudBackup(
  settings: Settings,
  signature?: string,
): Promise<CloudBackupMetadata> {
  if (runningBackup) return runningBackup;
  runningBackup = performBackup(settings, signature)
    .catch((error) => {
      const previous = readCloudBackupLocalState();
      emitState({ ...previous, lastError: error instanceof Error ? error.message : String(error) });
      throw error;
    })
    .finally(() => {
      runningBackup = null;
    });
  return runningBackup;
}

export async function getCloudBackupMetadata(): Promise<CloudBackupMetadata | null> {
  const user = await currentCloudUser();
  if (!user) return null;
  const { firestore } = await getFirebaseCloudServices();
  const snapshot = await metadataRef(firestore, user.uid).get();
  return snapshot.exists ? (snapshot.data() as CloudBackupMetadata) : null;
}

/** 最新のクラウドバックアップZIPを取得する。 */
export async function downloadLatestCloudBackup(): Promise<Blob> {
  const user = await currentCloudUser();
  if (!user) throw new Error('クラウドバックアップへログインしてください。');
  const { firestore, storage } = await getFirebaseCloudServices();

  let path = '';
  const state = await metadataRef(firestore, user.uid).get();
  if (state.exists) path = String(state.data()?.latestPath || '');

  // Firestoreメタデータが失われていても、Storageに残る最新スナップショットから復元する。
  if (!path) {
    const listed = await storage.ref(`${backupRoot(user.uid)}/snapshots`).listAll();
    const newest = listed.items
      .slice()
      .sort((a: any, b: any) => String(b.name).localeCompare(String(a.name)))[0];
    if (newest) path = newest.fullPath;
  }

  if (!path) throw new Error('クラウド上に復元できるバックアップがありません。');
  const url = await storage.ref(path).getDownloadURL();
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error('クラウドバックアップを取得できませんでした。');
  const blob = await response.blob();
  if (blob.size === 0) throw new Error('クラウドバックアップが空です。');
  return blob;
}
