'use client';

import { useEffect, useRef } from 'react';
import { getPageCount } from '@/lib/pdf';
import * as repo from '@/lib/repository';
import { activeFiles, activeFolders, toParentKey } from '@/lib/tree';
import { ROOT_ID, UNSORTED_ID } from '@/lib/types';
import type { Folder } from '@/lib/types';
import { useApp } from '@/store/AppStore';

const INDEX_URL = '/ionq/index.json';
const MAX_PER_RUN = 5;
const INVESTMENT_FOLDER_NAME = '01_投資';
const IONQ_REPORT_NAME = /^投資_IQ_\d{8}\.pdf$/;
const LEGACY_REPORT_NAME = /^\d{4}-\d{2}-\d{2}_IONQデイリーレポート\.pdf$/;

type IonqReportEntry = {
  id: string;
  file: string;
  name?: string;
  size?: number;
  generatedAt?: string;
};

function expectedReportName(id: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})-ionq$/.exec(id);
  if (!match) return null;
  return `投資_IQ_${match[1]}${match[2]}${match[3]}.pdf`;
}

function isEntry(value: unknown): value is IonqReportEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<IonqReportEntry>;
  const expectedName = expectedReportName(entry.id ?? '');
  if (!expectedName) return false;
  if (entry.file !== expectedName) return false;
  if (entry.name !== undefined && entry.name !== expectedName) return false;
  if (entry.size !== undefined && (!Number.isFinite(entry.size) || Number(entry.size) <= 0)) return false;
  if (entry.generatedAt !== undefined && typeof entry.generatedAt !== 'string') return false;
  return true;
}

function reportName(entry: IonqReportEntry): string {
  return entry.name || entry.file;
}

/** 同じ日付IDでも再生成されたPDFを区別するため、公開ファイルの版を含める。 */
function reportKey(entry: IonqReportEntry): string {
  return [entry.id, entry.file, entry.size ?? '', entry.generatedAt ?? ''].join('|');
}

function normalizedName(value: string): string {
  return value.trim().toLocaleLowerCase('ja-JP');
}

/** ルート直下にある「01_投資」フォルダーのIDを返す。 */
function investmentFolderId(folders: Folder[]): string | null {
  return (
    activeFolders(folders).find(
      (folder) =>
        toParentKey(folder.parentId) === ROOT_ID &&
        normalizedName(folder.name) === normalizedName(INVESTMENT_FOLDER_NAME),
    )?.id ?? null
  );
}

export function IonqReportImporter() {
  const { ready, fatalError, settings, updateSettings, reload, refreshStorage, notify } = useApp();
  const started = useRef(false);

  useEffect(() => {
    if (!ready || fatalError || started.current) return;
    started.current = true;
    let cancelled = false;

    void (async () => {
      let entries: IonqReportEntry[] = [];
      try {
        const response = await fetch(INDEX_URL, { cache: 'no-store' });
        if (response.ok) {
          const data: unknown = await response.json();
          const list = Array.isArray(data) ? data : (data as { reports?: unknown })?.reports;
          if (Array.isArray(list)) entries = list.filter(isEntry);
        }
      } catch {
        // 一覧を取得できない場合は、次回起動時に再試行する。
      }

      const importedKeys = new Set(settings.importedReports ?? []);
      const beforeImport = await repo.refresh();

      // 旧仕様の自動生成レポートは、正式版が公開されている場合だけごみ箱へ移す。
      let removedLegacy = 0;
      if (entries.length > 0) {
        const legacyReports = activeFiles(beforeImport.files).filter(
          (file) => file.origin === 'report' && LEGACY_REPORT_NAME.test(file.name),
        );
        for (const file of legacyReports) {
          if (cancelled) return;
          try {
            await repo.trashFile(file.id);
            removedLegacy += 1;
          } catch {
            // 旧形式の移動に失敗しても正式版の取り込みは続ける。
          }
        }
      }

      let currentSnapshot = removedLegacy > 0 ? await repo.refresh() : beforeImport;
      const initialDestinationId = investmentFolderId(currentSnapshot.folders);

      // 旧版でルート直下または未分類へ入ったIONQレポートは、次回起動時に移し直す。
      // ユーザーが別フォルダーへ手動整理したレポートまでは戻さない。
      let relocated = 0;
      if (initialDestinationId) {
        const misplacedReports = activeFiles(currentSnapshot.files).filter((file) => {
          const parentId = toParentKey(file.parentId);
          return (
            file.origin === 'report' &&
            IONQ_REPORT_NAME.test(file.name) &&
            (parentId === ROOT_ID || parentId === UNSORTED_ID)
          );
        });

        for (const file of misplacedReports) {
          if (cancelled) return;
          try {
            await repo.moveFile(file.id, initialDestinationId, { clearRule: true });
            relocated += 1;
          } catch {
            // 配置変更に失敗した場合は、次回起動時に再試行する。
          }
        }
      }

      if (relocated > 0) currentSnapshot = await repo.refresh();

      const localReportsByName = new Map(
        activeFiles(currentSnapshot.files)
          .filter((file) => file.origin === 'report')
          .map((file) => [normalizedName(file.name), file]),
      );

      const targets = entries
        .filter((entry) => {
          const key = reportKey(entry);
          if (importedKeys.has(key)) return false;

          const local = localReportsByName.get(normalizedName(reportName(entry)));
          const legacyIdWasImported = importedKeys.has(entry.id);

          if (legacyIdWasImported && !local) return true;
          if (legacyIdWasImported && local && entry.size && local.size !== entry.size) return true;
          return !legacyIdWasImported;
        })
        .sort((a, b) => b.id.localeCompare(a.id))
        .slice(0, MAX_PER_RUN);

      const imported: string[] = [];
      let added = 0;
      let updated = 0;

      for (const entry of targets) {
        if (cancelled) return;
        try {
          const response = await fetch(`/ionq/${entry.file}`, { cache: 'no-store' });
          if (!response.ok) continue;
          const blob = await response.blob();
          if (blob.size === 0) continue;
          const pageCount = await getPageCount(blob);
          const expectedName = reportName(entry);

          const latest = await repo.refresh();
          const destinationId = investmentFolderId(latest.folders) ?? UNSORTED_ID;
          const existingReport = activeFiles(latest.files).find(
            (file) => file.origin === 'report' && normalizedName(file.name) === normalizedName(expectedName),
          );

          if (existingReport) {
            if (existingReport.size !== blob.size || existingReport.pageCount !== pageCount) {
              await repo.replaceFileContent(existingReport.id, blob, { pageCount });
              updated += 1;
            }
            await repo.updateFile(existingReport.id, {
              tags: [...new Set([...existingReport.tags, 'IONQ', '株式レポート'])],
            });
            if (toParentKey(existingReport.parentId) !== destinationId) {
              await repo.moveFile(existingReport.id, destinationId, { clearRule: true });
              relocated += 1;
            }
            imported.push(reportKey(entry));
            continue;
          }

          const meta = await repo.addPdf(blob, expectedName, {
            // 毎朝生成されるIONQレポートは「01_投資」の直下へ直接配置する。
            // フォルダーが見つからない場合だけ未分類へ退避する。
            parentId: destinationId,
            onDuplicate: 'rename',
            pageCount,
            origin: 'report',
          });
          await repo.updateFile(meta.id, { tags: ['IONQ', '株式レポート'] });
          imported.push(reportKey(entry));
          added += 1;
        } catch {
          // 失敗したレポートは取り込み済みにせず、次回起動時に再試行する。
        }
      }

      if (cancelled) return;

      if (imported.length > 0) {
        const nextImported = [...new Set([...(settings.importedReports ?? []), ...imported])].slice(-240);
        await updateSettings({ importedReports: nextImported });
      }

      // 分類はFolderRuleRunnerへ集約する。
      // 起動時はルート直下だけ、以後はユーザーが表示したフォルダーだけを1階層移動する。
      if (imported.length > 0 || removedLegacy > 0 || relocated > 0) await reload();
      void refreshStorage();

      const changed = added + updated;
      if (changed > 0 || removedLegacy > 0 || relocated > 0) {
        const messages: string[] = [];
        if (changed > 0) messages.push(`IONQレポートを ${changed} 件取り込み・更新`);
        if (relocated > 0) messages.push(`${relocated} 件を「${INVESTMENT_FOLDER_NAME}」へ配置`);
        if (removedLegacy > 0) messages.push(`旧形式を ${removedLegacy} 件ごみ箱へ移動`);
        notify(`${messages.join('、')}しました`, 'success');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    fatalError,
    notify,
    ready,
    refreshStorage,
    reload,
    settings.importedReports,
    updateSettings,
  ]);

  return null;
}
