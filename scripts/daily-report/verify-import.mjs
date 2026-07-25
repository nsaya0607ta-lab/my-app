/**
 * pdf-manager の「毎朝のレポート自動取り込み」を実ブラウザーで検証する。
 *
 *   node scripts/daily-report/verify-import.mjs [baseUrl]
 *
 * 1. アプリを開いて初期化を待つ
 * 2. IndexedDB の設定へ「自動取り込みON・取り込み先=学習フォルダー」を書き込む
 * 3. リロードして取り込みを走らせる
 * 4. files ストアを読み、指定フォルダーに PDF が入ったか確認する
 * 5. もう一度リロードして、二重取り込みが起きないことを確認する
 */
import puppeteer from 'puppeteer';

const BASE_URL = process.argv[2] || 'http://localhost:3000';

/**
 * IndexedDB を読むページ内スクリプト。
 *
 * 重要: DB が未作成のときに indexedDB.open すると、ストアを持たない空の DB を
 * バージョン1で作ってしまい、アプリ側が二度とストアを作れなくなる。
 * 必ず databases() で存在を確かめ、ストアが揃うまでは ready:false を返す。
 */
const EMPTY_STATE = { ready: false, folders: [], files: [], blobCount: 0, settings: null };

const readState = `
  (async () => {
    const empty = ${JSON.stringify(EMPTY_STATE)};
    const known = await indexedDB.databases();
    if (!known.some((entry) => entry.name === 'pdf-folder-manager')) return empty;

    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('pdf-folder-manager');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('blocked'));
    });

    const required = ['folders', 'files', 'blobs', 'settings'];
    if (!required.every((name) => db.objectStoreNames.contains(name))) {
      db.close();
      return empty;
    }

    const all = (store) => new Promise((resolve, reject) => {
      const request = db.transaction(store, 'readonly').objectStore(store).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const settingsRows = await all('settings');
    const state = {
      ready: true,
      folders: (await all('folders')).map((f) => ({ id: f.id, name: f.name })),
      files: (await all('files')).map((f) => ({ id: f.id, name: f.name, parentId: f.parentId, size: f.size })),
      blobCount: (await all('blobs')).length,
      settings: settingsRows.find((r) => r.key === 'app')?.value ?? null,
    };
    db.close();
    return state;
  })()
`;

function fail(message) {
  console.error(`\n✗ ${message}`);
  process.exitCode = 1;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * IndexedDB の中身を読む。
 * dev サーバーはファイル変更で自動リロードするため、評価中にページが
 * 遷移して "Execution context was destroyed" になることがある。再試行する。
 */
async function read(page, { attempts = 5 } = {}) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await page.evaluate(readState);
    } catch (error) {
      lastError = error;
      await sleep(600);
    }
  }
  throw lastError;
}

/**
 * 条件を満たすまで IndexedDB を読み直す。
 * page.waitForFunction はページ側で非同期の DB 読み取りを扱いにくいため、
 * Node 側からポーリングする。
 */
async function settle(page, predicate, { timeoutMs = 20000, intervalMs = 500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await read(page, { attempts: 1 }).catch(() => null);
    if (last && predicate(last)) return last;
    await sleep(intervalMs);
  }
  return last;
}

/* 期待件数は配信中の index.json から決める ------------------------------ */
const expected = await fetch(`${BASE_URL}/daily/index.json`)
  .then((r) => r.json())
  .then((data) => (Array.isArray(data?.reports) ? data.reports.length : 0))
  .catch(() => 0);

if (expected === 0) {
  console.error('✗ /daily/index.json にレポートが1件もありません。先に generate.mjs を実行してください。');
  process.exit(1);
}
console.log(`index.json のレポート数: ${expected} 件`);

const browser = await puppeteer.launch({ headless: 'new' });
try {
  const page = await browser.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') console.error('  [browser error]', message.text());
  });

  /* 1. 初期化を待つ ------------------------------------------------- */
  await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
  // bootstrap() が DB とストアを作り、既定フォルダーを入れ終えるまで待つ
  await settle(page, (state) => state.ready && state.folders.length > 0);

  const initial = await read(page);
  console.log(`初期状態: フォルダー ${initial.folders.length} 件 / PDF ${initial.files.length} 件`);

  const target = initial.folders.find((f) => f.name === '学習');
  if (!target) {
    fail('「学習」フォルダーが見つかりません（初期フォルダーの生成に失敗）');
    throw new Error('setup failed');
  }

  /* 2. 設定を書き込む ----------------------------------------------- */
  const writeSettings = () =>
    page.evaluate(
      `(async (folderId) => {
      // ここに来る時点でストアは作成済み。バージョンは指定せず既存を開く
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('pdf-folder-manager');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const tx = db.transaction('settings', 'readwrite');
      const store = tx.objectStore('settings');
      const current = await new Promise((resolve) => {
        const r = store.get('app');
        r.onsuccess = () => resolve(r.result?.value ?? {});
        r.onerror = () => resolve({});
      });
      store.put({ key: 'app', value: { ...current, onboardingDone: true, dailyReportEnabled: true, dailyReportFolderId: folderId, importedReports: [] } });
      await new Promise((resolve) => { tx.oncomplete = resolve; });
      db.close();
    })(${JSON.stringify(target.id)})`,
    );

  // 書き込み中にホットリロードが挟まることがあるので数回試す
  for (let i = 0; ; i += 1) {
    try {
      await writeSettings();
      break;
    } catch (error) {
      if (i >= 4) throw error;
      await sleep(600);
    }
  }
  console.log(`設定を書き込みました（取り込み先: ${target.name}）`);

  /* 3. リロードして取り込みを走らせる -------------------------------- */
  await page.reload({ waitUntil: 'networkidle2' });
  const after = await settle(page, (state) => state.files.length >= expected);
  const imported = after.files.filter((f) => f.parentId === target.id);

  console.log(`\n取り込み後: PDF ${after.files.length} 件（うち「${target.name}」直下 ${imported.length} 件）`);
  for (const file of imported) console.log(`  - ${file.name} (${file.size} bytes)`);
  console.log(`  importedReports: ${JSON.stringify(after.settings?.importedReports ?? [])}`);

  if (imported.length !== expected) {
    fail(`「${target.name}」に${expected}件入るはずが ${imported.length} 件でした`);
  }
  if (after.blobCount !== imported.length) fail(`blobs が ${after.blobCount} 件（PDF実体が保存されていません）`);
  if ((after.settings?.importedReports ?? []).length !== expected) {
    fail('importedReports に記録されていません');
  }

  /* 4. 二重取り込みが起きないこと ------------------------------------ */
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(4000);
  const second = await read(page);
  const secondCount = second.files.filter((f) => f.parentId === target.id).length;
  console.log(`\n再起動後: 「${target.name}」直下 ${secondCount} 件`);
  if (secondCount !== imported.length) fail(`再起動で件数が ${imported.length} → ${secondCount} に変化しました（二重取り込み）`);

  if (!process.exitCode) console.log('\n✓ すべての確認項目を満たしました');
} finally {
  await browser.close();
}
