'use client';

/**
 * ホーム画面。
 * パソコンのエクスプローラーの「PC」に相当し、最上位のフォルダーを並べる。
 */
import { useMemo } from 'react';
import {
  Clock,
  FolderPlus,
  Inbox,
  ListFilter,
  Search,
  Star,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { formatBytes } from '@/lib/format';
import { ROOT_ID, UNSORTED_ID, type ExplorerItem } from '@/lib/types';
import { childFiles, countPdfInFolder, folderUpdatedAt, sortItems, toParentKey } from '@/lib/tree';
import { useApp } from '@/store/AppStore';
import { FolderCard } from '@/components/items/ItemViews';
import { ItemList } from '@/components/items/ItemList';
import { Button, IconButton, SectionTitle } from '@/components/ui/Primitives';
import type { ItemHandlers } from '@/components/items/ItemViews';
import { Header } from './Header';

function QuickTile({
  icon: Icon,
  label,
  count,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="card flex min-h-tap flex-1 items-center gap-2 px-3 py-2.5 text-left active:bg-surface-sub dark:active:bg-[#232b35]"
    >
      <Icon size={20} className="shrink-0 text-brand-500" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-ink dark:text-[#e6eaef]">{label}</span>
        <span className="block text-xs text-ink-sub dark:text-[#98a3b0]">{count} 件</span>
      </span>
    </button>
  );
}

export function HomeView({
  handlers,
  onCreateFolder,
  onOpenSort,
}: {
  handlers: ItemHandlers;
  onCreateFolder: () => void;
  onOpenSort: () => void;
}) {
  const { folders, files, settings, navigate, storage } = useApp();

  const rootFolders = useMemo(
    () =>
      folders.filter((folder) => !folder.deletedAt && toParentKey(folder.parentId) === ROOT_ID),
    [folders],
  );

  const sortedFolders = useMemo(() => {
    const items: ExplorerItem[] = rootFolders.map((folder) => ({ kind: 'folder', folder }));
    return sortItems(items, settings.sortKey, settings.foldersFirst)
      .filter((item): item is Extract<ExplorerItem, { kind: 'folder' }> => item.kind === 'folder')
      .map((item) => item.folder);
  }, [rootFolders, settings.foldersFirst, settings.sortKey]);

  const rootFiles = useMemo(() => childFiles(files, ROOT_ID), [files]);

  const counts = useMemo(() => {
    const active = files.filter((file) => !file.deletedAt);
    return {
      favorite: active.filter((file) => file.isFavorite).length,
      unsorted: active.filter((file) => toParentKey(file.parentId) === UNSORTED_ID).length,
      recent: active.filter((file) => file.lastOpenedAt).length,
      trash:
        files.filter((file) => file.deletedAt).length +
        folders.filter((folder) => folder.deletedAt).length,
    };
  }, [files, folders]);

  return (
    <>
      <Header
        title="PDFフォルダー"
        subtitle={
          storage
            ? `使用量 ${formatBytes(storage.usage)}${storage.quota ? ` / 上限の目安 ${formatBytes(storage.quota)}` : ''}`
            : 'この端末に保存されています'
        }
        right={
          <div className="flex items-center">
            <IconButton label="検索" onClick={() => navigate({ view: 'search' })}>
              <Search size={22} />
            </IconButton>
            <IconButton label="表示と並べ替え" onClick={onOpenSort}>
              <ListFilter size={22} />
            </IconButton>
          </div>
        }
      />

      <div className="flex gap-2 px-4 pt-3">
        <QuickTile
          icon={Star}
          label="お気に入り"
          count={counts.favorite}
          onClick={() => navigate({ view: 'favorites' })}
        />
        <QuickTile
          icon={Clock}
          label="最近使った項目"
          count={counts.recent}
          onClick={() => navigate({ view: 'recent' })}
        />
      </div>
      <div className="flex gap-2 px-4 pt-2">
        <QuickTile
          icon={Inbox}
          label="未分類"
          count={counts.unsorted}
          onClick={() => navigate({ view: 'folder', folderId: UNSORTED_ID })}
        />
        <QuickTile
          icon={Trash2}
          label="ごみ箱"
          count={counts.trash}
          onClick={() => navigate({ view: 'trash' })}
        />
      </div>

      <SectionTitle
        action={
          <Button variant="ghost" className="h-9 min-h-0 px-2 text-sm" onClick={onCreateFolder}>
            <FolderPlus size={18} />
            フォルダー作成
          </Button>
        }
      >
        フォルダー
      </SectionTitle>

      <div className="no-h-swipe grid grid-cols-1 gap-2 px-4 sm:grid-cols-2 lg:grid-cols-3">
        {sortedFolders.map((folder) => (
          <FolderCard
            key={folder.id}
            folder={folder}
            count={countPdfInFolder(folders, files, folder.id)}
            updatedAt={folderUpdatedAt(folders, files, folder)}
            onOpen={() => navigate({ view: 'folder', folderId: folder.id })}
            onMenu={() => handlers.onMenu({ kind: 'folder', folder })}
          />
        ))}
      </div>

      {rootFiles.length > 0 ? (
        <>
          <SectionTitle>直下のPDF</SectionTitle>
          <div className="card mx-4 overflow-hidden">
            <ItemList
              items={rootFiles.map((file) => ({ kind: 'file', file }))}
              viewMode="list"
              handlers={handlers}
            />
          </div>
        </>
      ) : null}
    </>
  );
}
