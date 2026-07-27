'use client';

import { useCallback, useEffect, useRef } from 'react';
import { planFiles } from '@/lib/classifyRun';
import { listRules } from '@/lib/classifyRules';
import { uploadToCloud } from '@/lib/cloudStorage';
import { cloudRef } from '@/lib/firebaseCloud';
import { getPageCount } from '@/lib/pdf';
import * as repo from '@/lib/repository';
import { activeFiles, activeFolders, toParentKey } from '@/lib/tree';
import { ROOT_ID, storageStateOf, type PdfFileMeta } from '@/lib/types';
import { useApp } from '@/store/AppStore';
import { useCloudRequired } from '@/store/CloudStore';

const INBOX_FOLDER_NAME = '00_受信';
const MAX_PER_RUN = 10;
const CHECK_INTERVAL_MS = 5 * 60_000;
const DRIVE_RECORD_PREFIX = 'drive:';
const IMPORTED_RECORD_LIMIT = 240;

type InboxMetadata = {
  size?: number | string;
  contentType?: string;
  customMetadata?: Record<string, string>;
};

type InboxItem = {
  name: string;
  fullPath?: string;
  getMetadata(): Promise<InboxMetadata>;
  getDownloadURL(): Promise<string>;
  delete(): Promise<void>;
};

type InboxReference = {
  listAll(): Promise<{ items: InboxItem[] }>;
};

function decodeBase64Utf8(value: string | undefined): string {
  if (!value) return 'Google Drive.pdf';

  try {
    const binary = window.atob(value);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return 'Google Drive.pdf';
  }
}

function mappingPrefix(importKey: string): string {
  return `${DRIVE_RECORD_PREFIX}${importKey}:`;
}

function mappedFileId(records: string[], importKey: string): string | null {
  const prefix = mappingPrefix(importKey);
  const record = records.find((entry) => entry.startsWith(prefix));
  return record?.slice(prefix.length) || null;
}

function replaceMapping(records: string[], importKey: string, fileId: string): string[] {
  const prefix = mappingPrefix(importKey);
  return [...records.filter((entry) => !entry.startsWith(prefix)), `${prefix}${fileId}`].slice(
    -IMPORTED_RECORD_LIMIT,
  );
}

async function ensureInboxFolder(): Promise<string> {
  const snapshot = await repo.refresh();
  const existing = activeFolders(snapshot.folders).find(
    (folder) =>
      toParentKey(folder.parentId) === ROOT_ID &&
      folder.name.trim().toLocaleLowerCase('ja-JP') ===
        INBOX_FOLDER_NAME.toLocaleLowerCase('ja-JP'),
  );

  if (existing) return existing.id;
  return (await repo.createFolder(ROOT_ID, INBOX_FOLDER_NAME, 'blue')).id;
}

export function DrivePdfImporter() {
  const {
    ready,
    fatalError,
    settings,
    updateSettings,
    reload,
    refreshStorage,
    notify,
    getThumbnail,
  } = useApp();
  const { active, user } = useCloudRequired();
  const running = useRef(false);

  const runImport = useCallback(async () => {
    if (running.current || !ready || fatalError || !active || !user) return;
    running.current = true;

    let importedCount = 0;
    let didChange = false;

    try {
      const uid = user.uid;
      const inboxFolderId = await ensureInboxFolder();
      const inbox = (await cloudRef(`users/${uid}/drive-inbox`)) as InboxReference;
      const listed = await inbox.listAll();
      const items = listed.items.slice(0, MAX_PER_RUN);
      if (items.length === 0) return;

      let records = [...(settings.importedReports ?? [])];
      const rules = settings.classifyEnabled ? await listRules().catch(() => []) : [];

      for (const item of items) {
        try {
          const metadata = await item.getMetadata();
          const custom = metadata.customMetadata ?? {};
          const importKey = custom.importKey || item.name.replace(/\.pdf$/i, '');
          if (!importKey) continue;

          const knownFileId = mappedFileId(records, importKey);
          let localFile: PdfFileMeta | undefined = knownFileId
            ? await repo.readFileMeta(knownFileId)
            : undefined;

          if (localFile?.deletedAt) localFile = undefined;

          if (!localFile) {
            const downloadUrl = await item.getDownloadURL();
            const response = await fetch(downloadUrl, { cache: 'no-store' });
            if (!response.ok) continue;

            const blob = await response.blob();
            const expectedSize = Number(metadata.size);
            if (
              blob.size <= 0 ||
              (Number.isFinite(expectedSize) && expectedSize > 0 && blob.size !== expectedSize)
            ) {
              continue;
            }

            const originalName = decodeBase64Utf8(custom.originalNameB64);
            if (!repo.isPdf(blob, originalName)) continue;

            const pageCount = await getPageCount(blob);
            localFile = await repo.addPdf(blob, originalName, {
              parentId: inboxFolderId,
              onDuplicate: 'rename',
              pageCount,
              origin: 'file',
              sharedFrom: 'Google Drive',
              sourceFormats: ['pdf'],
            });
            localFile = await repo.updateFile(localFile.id, { tags: ['Google Drive'] });

            records = replaceMapping(records, importKey, localFile.id);
            await updateSettings({ importedReports: records });
            importedCount += 1;
            didChange = true;
          }

          if (
            storageStateOf(localFile) !== 'cloud' &&
            settings.classifyEnabled &&
            rules.length > 0 &&
            toParentKey(localFile.parentId) === inboxFolderId
          ) {
            const result = await planFiles([localFile], {
              rules,
              strategy: settings.classifyMultiMatch,
              textPages: settings.classifyTextPages,
            });
            const plan = result.plans.find((candidate) => !candidate.needsConfirm);
            if (plan) {
              await repo.moveFile(localFile.id, plan.toParentId, { ruleId: plan.rule.id });
              localFile = (await repo.readFileMeta(localFile.id)) ?? localFile;
              didChange = true;
            }
          }

          if (storageStateOf(localFile) !== 'cloud') {
            await getThumbnail(localFile.id).catch(() => null);
            const outcome = await uploadToCloud(uid, localFile.id);
            if (outcome === 'uploaded') didChange = true;
            localFile = (await repo.readFileMeta(localFile.id)) ?? localFile;
          }

          if (storageStateOf(localFile) === 'cloud') {
            await item.delete();
            didChange = true;
          }
        } catch (error) {
          console.error('Google Drive PDFの取り込みに失敗しました:', error);
          // 受信箱のPDFは削除せず、次回起動・オンライン復帰時に再試行する。
        }
      }

      if (didChange) {
        await reload();
        await refreshStorage();
      }
      if (importedCount > 0) {
        notify(`Google DriveからPDFを ${importedCount} 件取り込みました`, 'success');
      }
    } catch (error) {
      console.error('Google Drive受信箱の確認に失敗しました:', error);
    } finally {
      running.current = false;
    }
  }, [
    active,
    fatalError,
    getThumbnail,
    notify,
    ready,
    refreshStorage,
    reload,
    settings.classifyEnabled,
    settings.classifyMultiMatch,
    settings.classifyTextPages,
    settings.importedReports,
    updateSettings,
    user,
  ]);

  useEffect(() => {
    void runImport();

    const timer = window.setInterval(() => {
      void runImport();
    }, CHECK_INTERVAL_MS);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void runImport();
    };
    const handleOnline = () => void runImport();

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleOnline);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
    };
  }, [runImport]);

  return null;
}
