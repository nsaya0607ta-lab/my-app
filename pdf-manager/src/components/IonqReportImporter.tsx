'use client';

import { useEffect, useRef } from 'react';
import { AppError } from '@/lib/errors';
import { getPageCount } from '@/lib/pdf';
import * as repo from '@/lib/repository';
import { ROOT_ID } from '@/lib/types';
import { useApp } from '@/store/AppStore';

const INDEX_URL = '/ionq/index.json';
const MAX_PER_RUN = 5;

type IonqReportEntry = { id: string; file: string; name?: string };

function isEntry(value: unknown): value is IonqReportEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<IonqReportEntry>;
  return typeof entry.id === 'string' && entry.id.endsWith('-ionq') && typeof entry.file === 'string' && entry.file.toLowerCase().endsWith('.pdf') && !entry.file.includes('/') && !entry.file.includes('\\');
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
        if (!response.ok) return;
        const data: unknown = await response.json();
        const list = Array.isArray(data) ? data : (data as { reports?: unknown })?.reports;
        if (!Array.isArray(list)) return;
        entries = list.filter(isEntry);
      } catch {
        return;
      }

      const importedIds = new Set(settings.importedReports ?? []);
      const targets = entries.filter((entry) => !importedIds.has(entry.id)).sort((a, b) => b.id.localeCompare(a.id)).slice(0, MAX_PER_RUN);
      if (targets.length === 0 || cancelled) return;

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
            parentId: ROOT_ID,
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

      if (cancelled || imported.length === 0) return;
      const nextImported = [...new Set([...(settings.importedReports ?? []), ...imported])].slice(-240);
      await updateSettings({ importedReports: nextImported });
      await reload();
      void refreshStorage();
      if (added > 0) notify(`IONQレポートを ${added} 件取り込みました`, 'success');
    })();

    return () => { cancelled = true; };
  }, [fatalError, notify, ready, refreshStorage, reload, settings.importedReports, updateSettings]);

  return null;
}
