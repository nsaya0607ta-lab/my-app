/**
 * アプリのデータ操作をすべてここに集約する。
 *
 * UI からは常にこのモジュール経由でデータを触る。
 * クラウド同期を追加するときは、この層で「ローカルへ書く → 同期キューへ積む」
 * という流れに差し替えれば UI を変更せずに済む。
 */
import {
  STORE,
  idb,
  loadAll,
  readBlob,
  readSettings,
  tx,
  wipeAll,
  writeSettings,
} from './db';
import { AppError } from './errors';
import { createId, ensurePdfExtension, nextAvailableName, nowIso, sanitizeName } from './naming';
import {
  DEFAULT_SETTINGS,
  ROOT_ID,
  UNSORTED_ID,
  type Folder,
  type FolderColor,
  type Importance,
  type PdfFileMeta,
  type Settings,
} from './types';
import { descendantFolderIds, toParentKey } from './tree';

export type Snapshot = {
  folders: Folder[];
  files: PdfFileMeta[];
  settings: Settings;
};

const INITIAL_FOLDERS: { id?: string; name: string; color: FolderColor }[] = [
  { name: '仕事', color: 'yellow' },
  { name: '学習', color: 'yellow' },
  { name: '資格', color: 'yellow' },
  { name: 'マニュアル', color: 'yellow' },
  { name: '契約書', color: 'yellow' },
  { name: 'その他', color: 'yellow' },
  { id: UNSORTED_ID, name: '未分類', color: 'gray' },
];

/* ------------------------------------------------------------------ */
/* 初期化                                                              */
/* ------------------------------------------------------------------ */

/** 初回起動時に既定フォルダーを作成し、現在のスナップショットを返す。 */
export async function bootstrap(): Promise<Snapshot> {
  const stored = await readSettings();
  const settings: Settings = { ...DEFAULT_SETTINGS, ...stored };

  let { folders, files } = await loadAll();

  if (folders.length === 0) {
    const timestamp = nowIso();
    const seeded: Folder[] = INITIAL_FOLDERS.map((entry, index) => ({
      id: entry.id ?? createId('folder'),
      parentId: ROOT_ID,
      name: entry.name,
      color: entry.color,
      isFavorite: false,
      sortOrder: index,
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
    await tx(STORE.folders, 'readwrite', async (t) => {
      const store = t.objectStore(STORE.folders);
      for (const folder of seeded) await idb.put(store, folder);
    });
    folders = seeded;
  } else if (!folders.some((folder) => folder.id === UNSORTED_ID)) {
    // 「未分類」は取り込み先として必ず必要なので、無ければ作り直す
    const timestamp = nowIso();
    const unsorted: Folder = {
      id: UNSORTED_ID,
      parentId: ROOT_ID,
      name: '未分類',
      color: 'gray',
      isFavorite: false,
      sortOrder: folders.length,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await putFolder(unsorted);
    folders = [...folders, unsorted];
  }

  return { folders, files, settings };
}

export async function refresh(): Promise<{ folders: Folder[]; files: PdfFileMeta[] }> {
  return loadAll();
}

export async function saveSettings(settings: Settings): Promise<void> {
  await writeSettings(settings);
}

/* ------------------------------------------------------------------ */
/* フォルダー操作                                                      */
/* ------------------------------------------------------------------ */

async function putFolder(folder: Folder): Promise<void> {
  await tx(STORE.folders, 'readwrite', async (t) => {
    await idb.put(t.objectStore(STORE.folders), folder);
  });
}

async function putFile(file: PdfFileMeta): Promise<void> {
  await tx(STORE.files, 'readwrite', async (t) => {
    await idb.put(t.objectStore(STORE.files), file);
  });
}

export async function createFolder(
  parentId: string,
  rawName: string,
  color: FolderColor = 'yellow',
): Promise<Folder> {
  const name = sanitizeName(rawName);
  if (!name) throw new AppError('EMPTY_FOLDER_NAME');

  const { folders } = await loadAll();
  const siblings = folders
    .filter((folder) => !folder.deletedAt && toParentKey(folder.parentId) === parentId)
    .map((folder) => folder.name);

  const timestamp = nowIso();
  const folder: Folder = {
    id: createId('folder'),
    parentId,
    name: nextAvailableName(name, siblings),
    color,
    isFavorite: false,
    sortOrder: siblings.length,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await putFolder(folder);
  return folder;
}

export async function renameFolder(folderId: string, rawName: string): Promise<Folder> {
  const name = sanitizeName(rawName);
  if (!name) throw new AppError('EMPTY_FOLDER_NAME');

  const { folders } = await loadAll();
  const target = folders.find((folder) => folder.id === folderId);
  if (!target) throw new AppError('NOT_FOUND');

  const siblings = folders
    .filter(
      (folder) =>
        !folder.deletedAt &&
        folder.id !== folderId &&
        toParentKey(folder.parentId) === toParentKey(target.parentId),
    )
    .map((folder) => folder.name);

  const updated: Folder = {
    ...target,
    name: nextAvailableName(name, siblings),
    updatedAt: nowIso(),
  };
  await putFolder(updated);
  return updated;
}

export async function updateFolder(
  folderId: string,
  patch: Partial<Pick<Folder, 'color' | 'isFavorite' | 'sortOrder'>>,
): Promise<Folder> {
  const { folders } = await loadAll();
  const target = folders.find((folder) => folder.id === folderId);
  if (!target) throw new AppError('NOT_FOUND');
  const updated: Folder = { ...target, ...patch, updatedAt: nowIso() };
  await putFolder(updated);
  return updated;
}

/** 移動先として妥当か (自分自身・自分の配下は不可)。 */
export function canMoveFolder(folders: Folder[], folderId: string, destId: string): boolean {
  if (folderId === destId) return false;
  return !descendantFolderIds(folders, folderId).has(destId);
}

export async function moveFolder(folderId: string, destId: string): Promise<void> {
  const { folders } = await loadAll();
  const target = folders.find((folder) => folder.id === folderId);
  if (!target) throw new AppError('NOT_FOUND');
  if (!canMoveFolder(folders, folderId, destId)) throw new AppError('INVALID_MOVE');

  const siblings = folders
    .filter(
      (folder) =>
        !folder.deletedAt && folder.id !== folderId && toParentKey(folder.parentId) === destId,
    )
    .map((folder) => folder.name);

  await putFolder({
    ...target,
    parentId: destId,
    name: nextAvailableName(target.name, siblings),
    updatedAt: nowIso(),
  });
}

/** フォルダーを配下ごと複製する。 */
export async function copyFolder(folderId: string, destId: string): Promise<void> {
  const { folders, files } = await loadAll();
  const source = folders.find((folder) => folder.id === folderId);
  if (!source) throw new AppError('NOT_FOUND');
  if (!canMoveFolder(folders, folderId, destId)) throw new AppError('INVALID_MOVE');

  const timestamp = nowIso();
  const idMap = new Map<string, string>();
  const newFolders: Folder[] = [];
  const newFiles: { meta: PdfFileMeta; sourceId: string }[] = [];

  const siblingNames = folders
    .filter((folder) => !folder.deletedAt && toParentKey(folder.parentId) === destId)
    .map((folder) => folder.name);

  const walk = (currentId: string, newParentId: string, nameOverride?: string) => {
    const current = folders.find((folder) => folder.id === currentId);
    if (!current) return;
    const cloneId = createId('folder');
    idMap.set(currentId, cloneId);
    newFolders.push({
      ...current,
      id: cloneId,
      parentId: newParentId,
      name: nameOverride ?? current.name,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: undefined,
    });
    for (const child of folders) {
      if (!child.deletedAt && toParentKey(child.parentId) === currentId) {
        walk(child.id, cloneId);
      }
    }
    for (const file of files) {
      if (!file.deletedAt && toParentKey(file.parentId) === currentId) {
        newFiles.push({
          meta: {
            ...file,
            id: createId('file'),
            parentId: cloneId,
            createdAt: timestamp,
            updatedAt: timestamp,
            deletedAt: undefined,
          },
          sourceId: file.id,
        });
      }
    }
  };

  walk(folderId, destId, nextAvailableName(source.name, siblingNames));

  // Blob は元データを読み出して複製する
  const blobs = new Map<string, Blob>();
  for (const entry of newFiles) {
    if (!blobs.has(entry.sourceId)) {
      const blob = await readBlob(entry.sourceId);
      if (blob) blobs.set(entry.sourceId, blob);
    }
  }

  await tx([STORE.folders, STORE.files, STORE.blobs], 'readwrite', async (t) => {
    const folderStore = t.objectStore(STORE.folders);
    const fileStore = t.objectStore(STORE.files);
    const blobStore = t.objectStore(STORE.blobs);
    for (const folder of newFolders) await idb.put(folderStore, folder);
    for (const entry of newFiles) {
      await idb.put(fileStore, entry.meta);
      const blob = blobs.get(entry.sourceId);
      if (blob) await idb.put(blobStore, { id: entry.meta.id, blob });
    }
  });
}

/** フォルダーを配下ごとごみ箱へ移す。 */
export async function trashFolder(folderId: string): Promise<void> {
  const { folders, files } = await loadAll();
  const target = folders.find((folder) => folder.id === folderId);
  if (!target) throw new AppError('NOT_FOUND');

  const ids = descendantFolderIds(
    folders.filter((folder) => !folder.deletedAt),
    folderId,
  );
  const timestamp = nowIso();

  await tx([STORE.folders, STORE.files], 'readwrite', async (t) => {
    const folderStore = t.objectStore(STORE.folders);
    const fileStore = t.objectStore(STORE.files);
    for (const folder of folders) {
      if (!ids.has(folder.id) || folder.deletedAt) continue;
      await idb.put(folderStore, {
        ...folder,
        deletedAt: timestamp,
        // 復元時に元の場所へ戻せるよう記録する (配下は親を保持したまま)
        restoreParentId: folder.id === folderId ? toParentKey(folder.parentId) : undefined,
        updatedAt: timestamp,
      });
    }
    for (const file of files) {
      if (file.deletedAt || !ids.has(toParentKey(file.parentId))) continue;
      await idb.put(fileStore, { ...file, deletedAt: timestamp, updatedAt: timestamp });
    }
  });
}

/** ごみ箱のフォルダーを復元する。 */
export async function restoreFolder(folderId: string): Promise<void> {
  const { folders, files } = await loadAll();
  const target = folders.find((folder) => folder.id === folderId);
  if (!target) throw new AppError('NOT_FOUND');

  const deletedAt = target.deletedAt;
  const ids = descendantFolderIds(
    folders.filter((folder) => folder.deletedAt === deletedAt || !folder.deletedAt),
    folderId,
  );

  // 復元先の親がすでに存在しない場合はルートへ戻す
  const parentExists = folders.some(
    (folder) => folder.id === target.restoreParentId && !folder.deletedAt,
  );
  const restoreParent =
    target.restoreParentId && (parentExists || target.restoreParentId === ROOT_ID)
      ? target.restoreParentId
      : ROOT_ID;

  await tx([STORE.folders, STORE.files], 'readwrite', async (t) => {
    const folderStore = t.objectStore(STORE.folders);
    const fileStore = t.objectStore(STORE.files);
    for (const folder of folders) {
      if (!ids.has(folder.id) || folder.deletedAt !== deletedAt) continue;
      await idb.put(folderStore, {
        ...folder,
        parentId: folder.id === folderId ? restoreParent : folder.parentId,
        deletedAt: undefined,
        restoreParentId: undefined,
        updatedAt: nowIso(),
      });
    }
    for (const file of files) {
      if (file.deletedAt !== deletedAt || !ids.has(toParentKey(file.parentId))) continue;
      await idb.put(fileStore, { ...file, deletedAt: undefined, updatedAt: nowIso() });
    }
  });
}

/** フォルダーを完全削除する (配下の PDF も消える)。 */
export async function purgeFolder(folderId: string): Promise<void> {
  const { folders, files } = await loadAll();
  const ids = descendantFolderIds(folders, folderId);
  const fileIds = files
    .filter((file) => ids.has(toParentKey(file.parentId)))
    .map((file) => file.id);

  await tx([STORE.folders, STORE.files, STORE.blobs, STORE.thumbs], 'readwrite', async (t) => {
    const folderStore = t.objectStore(STORE.folders);
    const fileStore = t.objectStore(STORE.files);
    const blobStore = t.objectStore(STORE.blobs);
    const thumbStore = t.objectStore(STORE.thumbs);
    for (const id of ids) await idb.delete(folderStore, id);
    for (const id of fileIds) {
      await idb.delete(fileStore, id);
      await idb.delete(blobStore, id);
      await idb.delete(thumbStore, id);
    }
  });
}

/* ------------------------------------------------------------------ */
/* PDF 操作                                                            */
/* ------------------------------------------------------------------ */

export type ImportResult = {
  added: PdfFileMeta[];
  skipped: { name: string; reason: string }[];
};

export function isPdf(file: File | Blob, name?: string): boolean {
  const fileName = name ?? (file instanceof File ? file.name : '');
  if (file.type === 'application/pdf') return true;
  // 一部の端末では type が空で渡ってくるため拡張子でも判定する
  return /\.pdf$/i.test(fileName) && (file.type === '' || file.type === 'application/octet-stream');
}

/** 同名判定に使う、指定フォルダー内の PDF 名一覧。 */
export function siblingFileNames(files: PdfFileMeta[], parentId: string, excludeId?: string) {
  return files
    .filter((file) => !file.deletedAt && toParentKey(file.parentId) === parentId && file.id !== excludeId)
    .map((file) => file.name);
}

export type AddPdfOptions = {
  parentId: string;
  /** 同名衝突時の扱い。既定は自動採番。 */
  onDuplicate?: 'rename' | 'overwrite' | 'skip';
  pageCount?: number;
};

export async function addPdf(
  blob: Blob,
  rawName: string,
  options: AddPdfOptions,
): Promise<PdfFileMeta> {
  const { files } = await loadAll();
  const name = ensurePdfExtension(sanitizeName(rawName) || 'untitled');
  const existingNames = siblingFileNames(files, options.parentId);
  const conflict = files.find(
    (file) =>
      !file.deletedAt &&
      toParentKey(file.parentId) === options.parentId &&
      file.name.toLowerCase() === name.toLowerCase(),
  );

  if (conflict && options.onDuplicate === 'skip') {
    throw new AppError('DUPLICATE_NAME', name);
  }

  const timestamp = nowIso();

  if (conflict && options.onDuplicate === 'overwrite') {
    const updated: PdfFileMeta = {
      ...conflict,
      size: blob.size,
      pageCount: options.pageCount ?? conflict.pageCount,
      updatedAt: timestamp,
      thumbState: 'none',
    };
    await tx([STORE.files, STORE.blobs, STORE.thumbs], 'readwrite', async (t) => {
      await idb.put(t.objectStore(STORE.files), updated);
      await idb.put(t.objectStore(STORE.blobs), { id: updated.id, blob });
      await idb.delete(t.objectStore(STORE.thumbs), updated.id);
    });
    return updated;
  }

  const meta: PdfFileMeta = {
    id: createId('file'),
    parentId: options.parentId,
    name: conflict ? nextAvailableName(name, existingNames) : name,
    size: blob.size,
    pageCount: options.pageCount,
    mimeType: 'application/pdf',
    tags: [],
    isFavorite: false,
    isRead: false,
    importance: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    thumbState: 'none',
  };

  await tx([STORE.files, STORE.blobs], 'readwrite', async (t) => {
    await idb.put(t.objectStore(STORE.files), meta);
    await idb.put(t.objectStore(STORE.blobs), { id: meta.id, blob });
  });
  return meta;
}

export async function renameFile(fileId: string, rawName: string): Promise<PdfFileMeta> {
  const { files } = await loadAll();
  const target = files.find((file) => file.id === fileId);
  if (!target) throw new AppError('NOT_FOUND');

  const name = ensurePdfExtension(sanitizeName(rawName));
  if (!sanitizeName(rawName)) throw new AppError('EMPTY_FILE_NAME');

  const siblings = siblingFileNames(files, toParentKey(target.parentId), fileId);
  const updated: PdfFileMeta = {
    ...target,
    name: nextAvailableName(name, siblings),
    updatedAt: nowIso(),
  };
  await putFile(updated);
  return updated;
}

export async function updateFile(
  fileId: string,
  patch: Partial<
    Pick<
      PdfFileMeta,
      'tags' | 'memo' | 'isFavorite' | 'isRead' | 'importance' | 'pageCount' | 'sortOrder' | 'thumbState'
    >
  >,
  options: { touch?: boolean } = {},
): Promise<PdfFileMeta> {
  const { files } = await loadAll();
  const target = files.find((file) => file.id === fileId);
  if (!target) throw new AppError('NOT_FOUND');
  const updated: PdfFileMeta = {
    ...target,
    ...patch,
    updatedAt: options.touch === false ? target.updatedAt : nowIso(),
  };
  await putFile(updated);
  return updated;
}

export async function markOpened(fileId: string): Promise<PdfFileMeta | undefined> {
  const { files } = await loadAll();
  const target = files.find((file) => file.id === fileId);
  if (!target) return undefined;
  const updated: PdfFileMeta = { ...target, isRead: true, lastOpenedAt: nowIso() };
  await putFile(updated);
  return updated;
}

export async function moveFile(fileId: string, destId: string): Promise<PdfFileMeta> {
  const { files } = await loadAll();
  const target = files.find((file) => file.id === fileId);
  if (!target) throw new AppError('NOT_FOUND');
  const siblings = siblingFileNames(files, destId, fileId);
  const updated: PdfFileMeta = {
    ...target,
    parentId: destId,
    name: nextAvailableName(target.name, siblings),
    updatedAt: nowIso(),
  };
  await putFile(updated);
  return updated;
}

export async function copyFile(fileId: string, destId: string): Promise<PdfFileMeta> {
  const { files } = await loadAll();
  const target = files.find((file) => file.id === fileId);
  if (!target) throw new AppError('NOT_FOUND');
  const blob = await readBlob(fileId);
  if (!blob) throw new AppError('NOT_FOUND');

  const siblings = siblingFileNames(files, destId);
  const timestamp = nowIso();
  const copy: PdfFileMeta = {
    ...target,
    id: createId('file'),
    parentId: destId,
    name: nextAvailableName(target.name, siblings),
    createdAt: timestamp,
    updatedAt: timestamp,
    lastOpenedAt: undefined,
    deletedAt: undefined,
    thumbState: 'none',
  };
  await tx([STORE.files, STORE.blobs], 'readwrite', async (t) => {
    await idb.put(t.objectStore(STORE.files), copy);
    await idb.put(t.objectStore(STORE.blobs), { id: copy.id, blob });
  });
  return copy;
}

export async function trashFile(fileId: string): Promise<void> {
  const { files } = await loadAll();
  const target = files.find((file) => file.id === fileId);
  if (!target) throw new AppError('NOT_FOUND');
  const timestamp = nowIso();
  await putFile({
    ...target,
    deletedAt: timestamp,
    restoreParentId: toParentKey(target.parentId),
    updatedAt: timestamp,
  });
}

export async function restoreFile(fileId: string): Promise<void> {
  const { folders, files } = await loadAll();
  const target = files.find((file) => file.id === fileId);
  if (!target) throw new AppError('NOT_FOUND');

  const desired = target.restoreParentId ?? toParentKey(target.parentId);
  const parentAlive =
    desired === ROOT_ID || folders.some((folder) => folder.id === desired && !folder.deletedAt);
  const parentId = parentAlive ? desired : UNSORTED_ID;
  const siblings = siblingFileNames(files, parentId, fileId);

  await putFile({
    ...target,
    parentId,
    name: nextAvailableName(target.name, siblings),
    deletedAt: undefined,
    restoreParentId: undefined,
    updatedAt: nowIso(),
  });
}

export async function purgeFile(fileId: string): Promise<void> {
  await tx([STORE.files, STORE.blobs, STORE.thumbs], 'readwrite', async (t) => {
    await idb.delete(t.objectStore(STORE.files), fileId);
    await idb.delete(t.objectStore(STORE.blobs), fileId);
    await idb.delete(t.objectStore(STORE.thumbs), fileId);
  });
}

/* ------------------------------------------------------------------ */
/* ごみ箱                                                              */
/* ------------------------------------------------------------------ */

export async function emptyTrash(): Promise<void> {
  const { folders, files } = await loadAll();
  const folderIds = folders.filter((folder) => folder.deletedAt).map((folder) => folder.id);
  const fileIds = files.filter((file) => file.deletedAt).map((file) => file.id);

  await tx([STORE.folders, STORE.files, STORE.blobs, STORE.thumbs], 'readwrite', async (t) => {
    const folderStore = t.objectStore(STORE.folders);
    const fileStore = t.objectStore(STORE.files);
    const blobStore = t.objectStore(STORE.blobs);
    const thumbStore = t.objectStore(STORE.thumbs);
    for (const id of folderIds) await idb.delete(folderStore, id);
    for (const id of fileIds) {
      await idb.delete(fileStore, id);
      await idb.delete(blobStore, id);
      await idb.delete(thumbStore, id);
    }
  });
}

/** 保持期間を過ぎたごみ箱の項目を自動削除する。起動時に呼ぶ。 */
export async function purgeExpiredTrash(retentionDays: number): Promise<number> {
  if (retentionDays <= 0) return 0;
  const { folders, files } = await loadAll();
  const limit = Date.now() - retentionDays * 86_400_000;
  const expired = (deletedAt?: string) =>
    Boolean(deletedAt) && new Date(deletedAt as string).getTime() < limit;

  const folderIds = folders.filter((folder) => expired(folder.deletedAt)).map((f) => f.id);
  const fileIds = files.filter((file) => expired(file.deletedAt)).map((f) => f.id);
  if (folderIds.length === 0 && fileIds.length === 0) return 0;

  await tx([STORE.folders, STORE.files, STORE.blobs, STORE.thumbs], 'readwrite', async (t) => {
    const folderStore = t.objectStore(STORE.folders);
    const fileStore = t.objectStore(STORE.files);
    const blobStore = t.objectStore(STORE.blobs);
    const thumbStore = t.objectStore(STORE.thumbs);
    for (const id of folderIds) await idb.delete(folderStore, id);
    for (const id of fileIds) {
      await idb.delete(fileStore, id);
      await idb.delete(blobStore, id);
      await idb.delete(thumbStore, id);
    }
  });
  return folderIds.length + fileIds.length;
}

/* ------------------------------------------------------------------ */
/* その他                                                              */
/* ------------------------------------------------------------------ */

export { readBlob, wipeAll };

export type { Importance };
