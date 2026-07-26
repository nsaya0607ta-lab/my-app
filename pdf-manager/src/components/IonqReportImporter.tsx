'use client';

import { useEffect, useRef } from 'react';
import { applyPlans, planFiles } from '@/lib/classifyRun';
import { listRules } from '@/lib/classifyRules';
import { getPageCount } from '@/lib/pdf';
import * as repo from '@/lib/repository';
import { activeFiles, activeFolders, toParentKey } from '@/lib/tree';
import { ROOT_ID, UNSORTED_ID } from '@/lib/types';
import type { Folder } from '@/lib/types';
import { useApp } from '@/store/AppStore';

const INDEX_URL = '/ionq/index.json';
const MAX_PER_RUN = 5;
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

/**
 * 同じ日付IDでも生成し直されたPDFを区別するため、公開ファイルの版を含めたキーを使う。
 * 旧版では日付IDだけを保存していたため、後方互換判定は取り込み処理側で行う。
 */
function reportKey(entry: IonqReportEntry): string {
  return [entry.id, entry.file, entry.size ?? '', entry.generatedAt ?? ''].join('|');
}

function normalizedName(value: string): string {
  return value.trim().toLocaleLowerCase('ja-JP');
}

/**
 * ルート直下を深さ1として、現在のフォルダーツリーの最大深度を返す。
 * 壊れた親参照や循環があっても停止する。
 */
function folderTreeDepth(folders: Folder[]): number {
  const foldersById = new Map(activeFolders(folders).map((folder) => [folder.id, folder]));
  let maxDepth = 1;

  for (const folder of foldersById.values()) {
    let depth = 1;
    let current: Folder | undefined = folder;
    const visited = new Set<string>();

    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      const parentId = toParentKey(current.parentId);
      if (parentId === ROOT_ID) break;

      const parent = foldersById.get(parentId);
      if (!parent) break;
      depth += 1;
      current = parent;
    }

    maxDepth = Math.max(maxDepth, depth);
  }

  return maxDepth;
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
        // レポート一覧を取得できなくても、起動時の自動分類は続ける
      }

      const importedKeys = new Set(settings.importedReports ?? []);
      const beforeImport = await repo.refresh();

      // 旧仕様で取り込まれた「YYYY-MM-DD_IONQデイリーレポート.pdf」は、
      // 正式な「投資_IQ_YYYYMMDD.pdf」が公開されている場合だけごみ箱へ移す。
      // 自動生成レポートだけを対象にするため、ユーザーが手動追加した同名PDFは触らない。
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
            // 削除に失敗しても、正式ファイルの取り込みは続ける
          }
        }
      }

      const currentSnapshot = removedLegacy > 0 ? await repo.refresh() : beforeImport;
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

          // 旧版の日付IDだけが記録済みでも、現在公開中のファイル名が端末に無ければ
          // 修正版・再生成版として取り込む。今回の 20260724 → 20260727 修正もここで救済する。
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

          // 同じ公開ファイル名の自動レポートがある場合は、場所・メモ・お気に入りを保ったまま
          // PDF本体だけを最新版へ差し替える。
          const latest = await repo.refresh();
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
            imported.push(reportKey(entry));
            continue;
          }

          const meta = await repo.addPdf(blob, expectedName, {
            // 自動取り込みも通常の追加と同じ入口へ置き、未分類フォルダーのルールを適用する。
            // 同名の手動PDFがある場合は消さず、自動採番してレポートを必ず取り込む。
            parentId: UNSORTED_ID,
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

      let moved = 0;
      if (settings.classifyEnabled) {
        try {
          const initialSnapshot = await repo.refresh();
          const maxPasses = folderTreeDepth(initialSnapshot.folders);
          const visitedFolderIdsByFile = new Map<string, Set<string>>();

          for (const file of activeFiles(initialSnapshot.files)) {
            visitedFolderIdsByFile.set(file.id, new Set([toParentKey(file.parentId)]));
          }

          for (let pass = 0; pass < maxPasses; pass += 1) {
            if (cancelled) return;

            // 各階層で必ず最新のファイル位置・フォルダー・ルールを読み直す。
            const [snapshot, latestRules] = await Promise.all([repo.refresh(), listRules()]);
            if (latestRules.length === 0) break;

            const files = activeFiles(snapshot.files);
            for (const file of files) {
              const currentFolderId = toParentKey(file.parentId);
              const visited = visitedFolderIdsByFile.get(file.id) ?? new Set<string>();
              visited.add(currentFolderId);
              visitedFolderIdsByFile.set(file.id, visited);
            }

            const result = await planFiles(files, {
              rules: latestRules,
              strategy: settings.classifyMultiMatch,
              textPages: settings.classifyTextPages,
            });

            const autoPlans = result.plans.filter((plan) => {
              if (plan.needsConfirm) return false;
              const visited = visitedFolderIdsByFile.get(plan.file.id) ?? new Set([plan.fromParentId]);
              visitedFolderIdsByFile.set(plan.file.id, visited);
              return !visited.has(plan.toParentId);
            });

            if (autoPlans.length === 0) break;

            const applied = await applyPlans(autoPlans);
            if (applied.moved.length === 0) break;

            moved += applied.moved.length;
            for (const record of applied.moved) {
              const visited = visitedFolderIdsByFile.get(record.fileId) ?? new Set<string>();
              visited.add(record.fromParentId);
              visited.add(record.toParentId);
              visitedFolderIdsByFile.set(record.fileId, visited);
            }
          }
        } catch {
          // 起動時の自動分類に失敗しても、アプリの表示とレポート取り込みは止めない
        }
      }

      if (cancelled) return;
      if (imported.length > 0 || moved > 0 || removedLegacy > 0) await reload();
      void refreshStorage();

      const changed = added + updated;
      if (changed > 0 || removedLegacy > 0) {
        const messages: string[] = [];
        if (changed > 0) messages.push(`IONQレポートを ${changed} 件取り込み・更新`);
        if (removedLegacy > 0) messages.push(`旧形式を ${removedLegacy} 件ごみ箱へ移動`);
        notify(`${messages.join('、')}しました`, 'success');
      }
    })();

    return () => { cancelled = true; };
  }, [fatalError, notify, ready, refreshStorage, reload, settings.classifyEnabled, settings.classifyMultiMatch, settings.classifyTextPages, settings.importedReports, updateSettings]);

  return null;
}
