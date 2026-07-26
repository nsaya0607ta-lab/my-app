'use client';

import { useEffect, useRef } from 'react';
import { applyPlans, planFiles } from '@/lib/classifyRun';
import { listRules } from '@/lib/classifyRules';
import { AppError } from '@/lib/errors';
import { getPageCount } from '@/lib/pdf';
import * as repo from '@/lib/repository';
import { activeFiles, activeFolders, toParentKey } from '@/lib/tree';
import { ROOT_ID, UNSORTED_ID } from '@/lib/types';
import type { Folder } from '@/lib/types';
import { useApp } from '@/store/AppStore';

const INDEX_URL = '/ionq/index.json';
const MAX_PER_RUN = 5;

type IonqReportEntry = { id: string; file: string; name?: string };

function isEntry(value: unknown): value is IonqReportEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<IonqReportEntry>;
  return typeof entry.id === 'string' && entry.id.endsWith('-ionq') && typeof entry.file === 'string' && entry.file.toLowerCase().endsWith('.pdf') && !entry.file.includes('/') && !entry.file.includes('\\');
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

      const importedIds = new Set(settings.importedReports ?? []);
      const targets = entries
        .filter((entry) => !importedIds.has(entry.id))
        .sort((a, b) => b.id.localeCompare(a.id))
        .slice(0, MAX_PER_RUN);

      const imported: string[] = [];
      let added = 0;
      for (const entry of targets) {
        if (cancelled) return;
        try {
          const response = await fetch(`/ionq/${entry.file}`, { cache: 'no-store' });
          if (!response.ok) continue;
          const blob = await response.blob();
          if (blob.size === 0) continue;
          const pageCount = await getPageCount(blob);
          const meta = await repo.addPdf(blob, entry.name || entry.file, {
            // 自動取り込みも通常の追加と同じ入口へ置き、未分類フォルダーのルールを適用する。
            parentId: UNSORTED_ID,
            onDuplicate: 'skip',
            pageCount,
            origin: 'report',
          });
          await repo.updateFile(meta.id, { tags: ['IONQ', '株式レポート'] });
          imported.push(entry.id);
          added += 1;
        } catch (error) {
          if (error instanceof AppError && error.code === 'DUPLICATE_NAME') imported.push(entry.id);
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
      if (imported.length > 0 || moved > 0) await reload();
      void refreshStorage();
      if (added > 0) notify(`IONQレポートを ${added} 件取り込みました`, 'success');
    })();

    return () => { cancelled = true; };
  }, [fatalError, notify, ready, refreshStorage, reload, settings.classifyEnabled, settings.classifyMultiMatch, settings.classifyTextPages, settings.importedReports, updateSettings]);

  return null;
}
