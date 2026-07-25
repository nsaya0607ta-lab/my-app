'use client';

/**
 * アプリ本体。画面の切り替え、ダイアログの制御、PDF の取り込み処理をまとめる。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Clock,
  FilePlus2,
  FolderPlus,
  Home,
  ImagePlus,
  Plus,
  Settings as SettingsIcon,
  Star,
  X,
} from 'lucide-react';
import { AppError, toMessage } from '@/lib/errors';
import { copyToClipboard, downloadBlob, isIos, openWithOtherApp, printPdf, sharePdf } from '@/lib/device';
import { ensurePdfExtension, nextAvailableName, sanitizeName, stripPdfExtension } from '@/lib/naming';
import { getPageCount } from '@/lib/pdf';
import * as repo from '@/lib/repository';
import { clearSharedFlag, hasSharedFlag, takeSharedFiles } from '@/lib/shareTarget';
import { collectTags } from '@/lib/search';
import { ROOT_ID, UNSORTED_ID, type ExplorerItem, type FolderColor, type Importance, type PdfFileMeta } from '@/lib/types';
import { ROOT_NAME, pathString, toParentKey } from '@/lib/tree';
import { useApp } from '@/store/AppStore';
import { Button, IconButton, Spinner, cx } from '@/components/ui/Primitives';
import { BottomSheet, MenuRow } from '@/components/ui/Sheet';
import { ColorSheet, ConfirmDialog, DetailsSheet, DuplicateDialog, NameDialog, SortSheet, TagMemoSheet } from '@/components/dialogs/CommonDialogs';
import { FolderPicker } from '@/components/dialogs/FolderPicker';
import { ItemMenu, type ItemMenuActions } from '@/components/dialogs/ItemMenu';
import { ScanSheet } from '@/components/dialogs/ScanSheet';
import { PdfViewer } from '@/components/viewer/PdfViewer';
import { Onboarding } from '@/components/Onboarding';
import { HomeView } from '@/components/views/HomeView';
import { FolderView } from '@/components/views/FolderView';
import { RecentView, FavoritesView, TrashView } from '@/components/views/CollectionViews';
import { SearchView } from '@/components/views/SearchView';
import { SettingsView } from '@/components/views/SettingsView';

type DuplicateChoice = 'overwrite' | 'rename' | 'cancel';

type PickerState =
  | { mode: 'import'; sources: { blob: Blob; name: string }[] }
  | { mode: 'move'; item: ExplorerItem }
  | { mode: 'copy'; item: ExplorerItem }
  | null;

export function AppShell() {
  const app = useApp();
  const {
    files,
    folders,
    settings,
    route,
    navigate,
    notify,
    reload,
    run,
    updateSettings,
    refreshStorage,
  } = app;

  const pdfInput = useRef<HTMLInputElement | null>(null);
  const importDest = useRef<string>(UNSORTED_ID);

  const [menuItem, setMenuItem] = useState<ExplorerItem | null>(null);
  const [addSheet, setAddSheet] = useState(false);
  const [picker, setPicker] = useState<PickerState>(null);
  const [newFolderParent, setNewFolderParent] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<ExplorerItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ExplorerItem | null>(null);
  const [colorTarget, setColorTarget] = useState<ExplorerItem | null>(null);
  const [tagTarget, setTagTarget] = useState<PdfFileMeta | null>(null);
  const [detailTarget, setDetailTarget] = useState<PdfFileMeta | null>(null);
  const [sortSheet, setSortSheet] = useState(false);
  const [scan, setScan] = useState<'camera' | 'gallery' | null>(null);
  const [viewer, setViewer] = useState<{ file: PdfFileMeta; blob: Blob } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [emptyTrashConfirm, setEmptyTrashConfirm] = useState(false);
  const [purgeTarget, setPurgeTarget] = useState<ExplorerItem | null>(null);
  const [duplicate, setDuplicate] = useState<{
    name: string;
    suggested: string;
    remaining: number;
  } | null>(null);

  const duplicateResolver = useRef<
    ((value: { choice: DuplicateChoice; applyToAll: boolean }) => void) | null
  >(null);

  const currentFolderId = route.view === 'folder' ? route.folderId : ROOT_ID;
  const knownTags = useMemo(() => collectTags(files).map((entry) => entry.tag), [files]);

  const pathOf = useCallback(
    (item: ExplorerItem) =>
      item.kind === 'folder'
        ? pathString(folders, item.folder.id)
        : `${pathString(folders, toParentKey(item.file.parentId))} ＞ ${item.file.name}`,
    [folders],
  );

  /* ---------------------------------------------------------------- */
  /* 取り込み                                                          */
  /* ---------------------------------------------------------------- */

  const askDuplicate = useCallback(
    (name: string, suggested: string, remaining: number) =>
      new Promise<{ choice: DuplicateChoice; applyToAll: boolean }>((resolve) => {
        duplicateResolver.current = resolve;
        setDuplicate({ name, suggested, remaining });
      }),
    [],
  );

  const importSources = useCallback(
    async (sources: { blob: Blob; name: string }[], destId: string) => {
      if (sources.length === 0) return;
      setBusy(`PDFを追加しています…（0 / ${sources.length}）`);
      let added = 0;
      let skipped = 0;
      let applyAll: DuplicateChoice | null = null;

      try {
        const snapshot = await repo.refresh();
        const taken = new Set(
          snapshot.files
            .filter((file) => !file.deletedAt && toParentKey(file.parentId) === destId)
            .map((file) => file.name.toLowerCase()),
        );

        for (let index = 0; index < sources.length; index += 1) {
          const source = sources[index];
          setBusy(`PDFを追加しています…（${index + 1} / ${sources.length}）`);

          if (!repo.isPdf(source.blob, source.name)) {
            notify(new AppError('NOT_PDF').message, 'error');
            skipped += 1;
            continue;
          }

          const name = ensurePdfExtension(sanitizeName(source.name) || 'untitled');
          let onDuplicate: 'rename' | 'overwrite' | 'skip' = 'rename';

          if (taken.has(name.toLowerCase())) {
            const choice =
              applyAll ??
              (await askDuplicate(
                name,
                nextAvailableName(name, taken),
                sources.length - index,
              ).then((result) => {
                if (result.applyToAll) applyAll = result.choice;
                return result.choice;
              }));
            if (choice === 'cancel') {
              skipped += 1;
              continue;
            }
            onDuplicate = choice === 'overwrite' ? 'overwrite' : 'rename';
          }

          const pageCount = await getPageCount(source.blob);
          const meta = await repo.addPdf(source.blob, name, {
            parentId: destId,
            onDuplicate,
            pageCount,
          });
          taken.add(meta.name.toLowerCase());
          added += 1;
        }

        await reload();
        void refreshStorage();
        const destName = destId === ROOT_ID ? ROOT_NAME : pathString(folders, destId);
        notify(
          `${added} 件のPDFを「${destName}」へ追加しました${skipped > 0 ? `（${skipped} 件は追加しませんでした）` : ''}`,
          'success',
        );
      } catch (error) {
        notify(toMessage(error), 'error');
      } finally {
        setBusy(null);
        setDuplicate(null);
        duplicateResolver.current = null;
      }
    },
    [askDuplicate, folders, notify, refreshStorage, reload],
  );

  /** ファイル選択 → 保存先を選ばせてから取り込む。 */
  const handlePickedFiles = useCallback(
    (list: FileList | null) => {
      if (!list || list.length === 0) return;
      const sources = Array.from(list).map((file) => ({ blob: file, name: file.name }));
      setPicker({ mode: 'import', sources });
    },
    [],
  );

  /* 共有メニューから届いた PDF を回収する ---------------------------- */
  useEffect(() => {
    if (!app.ready || app.fatalError) return;
    let cancelled = false;
    (async () => {
      const shared = await takeSharedFiles();
      if (cancelled || shared.length === 0) return;
      if (hasSharedFlag()) clearSharedFlag();
      setPicker({ mode: 'import', sources: shared });
    })();
    return () => {
      cancelled = true;
    };
  }, [app.fatalError, app.ready]);

  /* Service Worker 登録 --------------------------------------------- */
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const timer = setTimeout(() => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // 登録に失敗してもアプリ自体は動作する
      });
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  /* ---------------------------------------------------------------- */
  /* 個々の操作                                                        */
  /* ---------------------------------------------------------------- */

  const withBlob = useCallback(
    async (file: PdfFileMeta, action: (blob: Blob) => Promise<void> | void) => {
      try {
        const blob = await repo.readBlob(file.id);
        if (!blob) throw new AppError('NOT_FOUND');
        await action(blob);
      } catch (error) {
        notify(toMessage(error), 'error');
      }
    },
    [notify],
  );

  const openFile = useCallback(
    async (file: PdfFileMeta) => {
      setBusy('PDFを開いています…');
      try {
        const blob = await repo.readBlob(file.id);
        if (!blob) throw new AppError('NOT_FOUND');
        setViewer({ file, blob });
        await repo.markOpened(file.id);
        await reload();
      } catch (error) {
        notify(toMessage(error), 'error');
      } finally {
        setBusy(null);
      }
    },
    [notify, reload],
  );

  const handlers = useMemo(
    () => ({
      onOpen: (item: ExplorerItem) => {
        if (item.kind === 'folder') navigate({ view: 'folder', folderId: item.folder.id });
        else void openFile(item.file);
      },
      onMenu: (item: ExplorerItem) => setMenuItem(item),
    }),
    [navigate, openFile],
  );

  const menuActions = useMemo<ItemMenuActions>(() => {
    const item = menuItem;
    if (!item) {
      return {
        onOpen: () => undefined,
        onRename: () => undefined,
        onMove: () => undefined,
        onCopy: () => undefined,
        onDelete: () => undefined,
        onToggleFavorite: () => undefined,
        onCopyPath: () => undefined,
      };
    }
    return {
      onOpen: () => handlers.onOpen(item),
      onRename: () => setRenameTarget(item),
      onMove: () => setPicker({ mode: 'move', item }),
      onCopy: () => setPicker({ mode: 'copy', item }),
      onDelete: () => setDeleteTarget(item),
      onToggleFavorite: () => {
        if (item.kind === 'folder') {
          void run(
            () => repo.updateFolder(item.folder.id, { isFavorite: !item.folder.isFavorite }),
            item.folder.isFavorite ? 'お気に入りを解除しました。' : 'お気に入りに登録しました。',
          );
        } else {
          void run(
            () => repo.updateFile(item.file.id, { isFavorite: !item.file.isFavorite }),
            item.file.isFavorite ? 'お気に入りを解除しました。' : 'お気に入りに登録しました。',
          );
        }
      },
      onShare:
        item.kind === 'file'
          ? () =>
              void withBlob(item.file, async (blob) => {
                const shared = await sharePdf(blob, item.file.name);
                if (!shared) {
                  downloadBlob(blob, item.file.name);
                  notify(
                    'この端末は共有シートに対応していないため、ダウンロードで書き出しました。',
                    'info',
                  );
                }
              })
          : undefined,
      onSaveToDevice:
        item.kind === 'file'
          ? () =>
              void withBlob(item.file, async (blob) => {
                if (isIos()) {
                  // iOS は共有シートの「ファイルに保存」が正規の保存経路
                  const shared = await sharePdf(blob, item.file.name);
                  if (shared) return;
                  downloadBlob(blob, item.file.name);
                  notify('新しいタブで開きます。共有ボタンから「ファイルに保存」を選んでください。', 'info');
                  return;
                }
                downloadBlob(blob, item.file.name);
                notify('ダウンロードに保存しました。', 'success');
              })
          : undefined,
      onPrint:
        item.kind === 'file'
          ? () => void withBlob(item.file, async (blob) => printPdf(blob))
          : undefined,
      onOpenWith:
        item.kind === 'file'
          ? () =>
              void withBlob(item.file, async (blob) => {
                const ok = await openWithOtherApp(blob, item.file.name);
                if (!ok) notify('他のアプリで開けませんでした。', 'error');
              })
          : undefined,
      onCopyPath: () => {
        void copyToClipboard(pathOf(item)).then((ok) =>
          notify(ok ? 'パスをコピーしました。' : 'パスをコピーできませんでした。', ok ? 'success' : 'error'),
        );
      },
      onDetails: item.kind === 'file' ? () => setDetailTarget(item.file) : undefined,
      onTags: item.kind === 'file' ? () => setTagTarget(item.file) : undefined,
      onColor: item.kind === 'folder' ? () => setColorTarget(item) : undefined,
      onToggleRead:
        item.kind === 'file'
          ? () =>
              void run(
                () => repo.updateFile(item.file.id, { isRead: !item.file.isRead }, { touch: false }),
                item.file.isRead ? '未閲覧にしました。' : '閲覧済みにしました。',
              )
          : undefined,
    };
  }, [handlers, menuItem, notify, pathOf, run, withBlob]);

  /* 削除 (ごみ箱へ) --------------------------------------------------- */
  const deleteInfo = useMemo(() => {
    if (!deleteTarget) return null;
    if (deleteTarget.kind === 'file') {
      return {
        title: 'PDFを削除しますか？',
        description: `「${deleteTarget.file.name}」をごみ箱へ移動します。${settings.trashRetentionDays > 0 ? `${settings.trashRetentionDays}日後に自動で完全削除されます。` : ''}`,
      };
    }
    const inside = files.filter(
      (file) => !file.deletedAt && toParentKey(file.parentId) === deleteTarget.folder.id,
    ).length;
    const nested = folders.filter(
      (folder) => !folder.deletedAt && toParentKey(folder.parentId) === deleteTarget.folder.id,
    ).length;
    const warning =
      inside > 0 || nested > 0
        ? `このフォルダーにはPDF ${inside} 件、サブフォルダー ${nested} 件が入っています。中身もまとめてごみ箱へ移動します。`
        : '';
    return {
      title: 'フォルダーを削除しますか？',
      description: `「${deleteTarget.folder.name}」をごみ箱へ移動します。${warning}`,
    };
  }, [deleteTarget, files, folders, settings.trashRetentionDays]);

  /* ---------------------------------------------------------------- */
  /* 画面                                                              */
  /* ---------------------------------------------------------------- */

  const openAddPdf = () => {
    setAddSheet(false);
    pdfInput.current?.click();
  };

  const renderView = () => {
    switch (route.view) {
      case 'home':
        return (
          <HomeView
            handlers={handlers}
            onCreateFolder={() => setNewFolderParent(ROOT_ID)}
            onOpenSort={() => setSortSheet(true)}
          />
        );
      case 'folder':
        return (
          <FolderView
            folderId={route.folderId}
            handlers={handlers}
            onOpenSort={() => setSortSheet(true)}
            onAdd={openAddPdf}
          />
        );
      case 'recent':
        return <RecentView handlers={handlers} />;
      case 'favorites':
        return <FavoritesView handlers={handlers} />;
      case 'trash':
        return (
          <TrashView
            onRestoreFolder={(id) => void run(() => repo.restoreFolder(id), '元の場所へ戻しました。')}
            onRestoreFile={(id) => void run(() => repo.restoreFile(id), '元の場所へ戻しました。')}
            onPurgeFolder={(id) => {
              const folder = folders.find((entry) => entry.id === id);
              if (folder) setPurgeTarget({ kind: 'folder', folder });
            }}
            onPurgeFile={(id) => {
              const file = files.find((entry) => entry.id === id);
              if (file) setPurgeTarget({ kind: 'file', file });
            }}
            onEmptyTrash={() => setEmptyTrashConfirm(true)}
          />
        );
      case 'search':
        return <SearchView handlers={handlers} />;
      case 'settings':
        return <SettingsView />;
      default:
        return null;
    }
  };

  if (!app.ready) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (app.fatalError) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center px-8 text-center">
        <div>
          <p className="text-lg font-semibold text-ink dark:text-[#e6eaef]">
            アプリを起動できません
          </p>
          <p className="mt-3 text-base leading-relaxed text-ink-sub dark:text-[#98a3b0]">
            {app.fatalError}
          </p>
        </div>
      </div>
    );
  }

  // 「＋」は下部中央の「PDF追加」ボタン 1 つに統一する。
  // 右下のフローティングボタンは廃止（同じ機能のボタンが 2 つ見える状態を解消）。

  return (
    <div className="min-h-[100dvh] overflow-x-hidden">
      <main
        className="mx-auto w-full max-w-3xl"
        style={{ paddingBottom: 'calc(var(--bottom-nav-height) + var(--safe-bottom) + 16px)' }}
      >
        {renderView()}
      </main>

      {/* PDF 選択用の隠し input */}
      <input
        ref={pdfInput}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={(event) => {
          handlePickedFiles(event.target.files);
          event.target.value = '';
        }}
      />

      <BottomNav
        current={route.view}
        onHome={() => navigate({ view: 'home' })}
        onRecent={() => navigate({ view: 'recent' })}
        onAdd={() => setAddSheet(true)}
        onFavorites={() => navigate({ view: 'favorites' })}
        onSettings={() => navigate({ view: 'settings' })}
      />

      {/* 追加メニュー */}
      <BottomSheet
        open={addSheet}
        title="追加"
        description={
          route.view === 'folder'
            ? `保存先の候補：${pathString(folders, currentFolderId)}`
            : undefined
        }
        onClose={() => setAddSheet(false)}
      >
        <MenuRow
          icon={<FilePlus2 size={22} />}
          label="PDFを追加"
          description="ファイルアプリから選択（複数選択できます）"
          onClick={openAddPdf}
        />
        <MenuRow
          icon={<FolderPlus size={22} />}
          label="フォルダーを作成"
          onClick={() => {
            setAddSheet(false);
            setNewFolderParent(currentFolderId);
          }}
        />
        <MenuRow
          icon={<Camera size={22} />}
          label="カメラでスキャン"
          description="撮影した書類をPDFにします"
          onClick={() => {
            setAddSheet(false);
            setScan('camera');
          }}
        />
        <MenuRow
          icon={<ImagePlus size={22} />}
          label="画像からPDFを作成"
          description="端末内の画像を選んでPDFにまとめます"
          onClick={() => {
            setAddSheet(false);
            setScan('gallery');
          }}
        />
        {isIos() ? (
          <p className="px-4 py-3 text-xs leading-relaxed text-ink-sub dark:text-[#98a3b0]">
            iPhone・iPadでは、SafariやChromeで開いたPDFを直接このアプリへ共有することはできません。
            共有メニューから一度「ファイル」アプリに保存し、「PDFを追加」から選択してください。
          </p>
        ) : (
          <p className="px-4 py-3 text-xs leading-relaxed text-ink-sub dark:text-[#98a3b0]">
            ホーム画面に追加すると、他のアプリの共有メニューに「PDFフォルダー」が表示され、
            PDFを直接送れるようになります。
          </p>
        )}
      </BottomSheet>

      {/* 操作メニュー */}
      <ItemMenu
        item={menuItem}
        path={menuItem ? pathOf(menuItem) : ''}
        actions={menuActions}
        onClose={() => setMenuItem(null)}
      />

      {/* 保存先 / 移動先 */}
      <FolderPicker
        open={picker !== null}
        title={
          picker?.mode === 'import'
            ? '保存先のフォルダーを選択'
            : picker?.mode === 'copy'
              ? 'コピー先のフォルダーを選択'
              : '移動先のフォルダーを選択'
        }
        description={
          picker?.mode === 'import'
            ? `${picker.sources.length} 件のPDFを追加します。選ばなかった場合は「未分類」に保存します。`
            : undefined
        }
        confirmLabel={picker?.mode === 'import' ? 'ここに保存' : 'ここに移動'}
        folders={folders}
        initialFolderId={picker?.mode === 'import' ? currentFolderId : currentFolderId}
        excludeFolderId={
          picker && picker.mode !== 'import' && picker.item.kind === 'folder'
            ? picker.item.folder.id
            : undefined
        }
        onClose={() => {
          if (picker?.mode === 'import') {
            // 保存先を選ばなかった場合は「未分類」へ
            const sources = picker.sources;
            setPicker(null);
            void importSources(sources, UNSORTED_ID);
            return;
          }
          setPicker(null);
        }}
        onCreateFolder={(parentId) => setNewFolderParent(parentId)}
        onConfirm={(folderId) => {
          const state = picker;
          setPicker(null);
          if (!state) return;
          if (state.mode === 'import') {
            importDest.current = folderId;
            void importSources(state.sources, folderId);
            return;
          }
          const { item } = state;
          if (state.mode === 'move') {
            if (item.kind === 'folder') {
              void run(() => repo.moveFolder(item.folder.id, folderId), 'フォルダーを移動しました。');
            } else {
              void run(() => repo.moveFile(item.file.id, folderId), 'PDFを移動しました。');
            }
          } else {
            if (item.kind === 'folder') {
              void run(() => repo.copyFolder(item.folder.id, folderId), 'フォルダーをコピーしました。');
            } else {
              void run(() => repo.copyFile(item.file.id, folderId), 'PDFをコピーしました。');
            }
          }
        }}
      />

      {/* 新規フォルダー */}
      <NameDialog
        open={newFolderParent !== null}
        title="新しいフォルダー"
        label="フォルダー名"
        initialValue=""
        confirmLabel="作成"
        hint={
          newFolderParent
            ? `作成場所：${newFolderParent === ROOT_ID ? ROOT_NAME : pathString(folders, newFolderParent)}`
            : undefined
        }
        onClose={() => setNewFolderParent(null)}
        onSubmit={(value) => {
          const parent = newFolderParent ?? ROOT_ID;
          setNewFolderParent(null);
          void run(() => repo.createFolder(parent, value), 'フォルダーを作成しました。');
        }}
      />

      {/* 名前変更 */}
      <NameDialog
        open={renameTarget !== null}
        title="名前を変更"
        label={renameTarget?.kind === 'folder' ? 'フォルダー名' : 'ファイル名'}
        initialValue={
          renameTarget
            ? renameTarget.kind === 'folder'
              ? renameTarget.folder.name
              : stripPdfExtension(renameTarget.file.name)
            : ''
        }
        confirmLabel="変更"
        hint={renameTarget?.kind === 'file' ? '拡張子（.pdf）は自動で付きます。' : undefined}
        onClose={() => setRenameTarget(null)}
        onSubmit={(value) => {
          const target = renameTarget;
          setRenameTarget(null);
          if (!target) return;
          if (target.kind === 'folder') {
            void run(() => repo.renameFolder(target.folder.id, value), '名前を変更しました。');
          } else {
            void run(() => repo.renameFile(target.file.id, value), '名前を変更しました。');
          }
        }}
      />

      {/* 削除確認 */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title={deleteInfo?.title ?? ''}
        description={deleteInfo?.description}
        confirmLabel="ごみ箱へ移動"
        tone="danger"
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          const target = deleteTarget;
          setDeleteTarget(null);
          if (!target) return;
          if (target.kind === 'folder') {
            void run(() => repo.trashFolder(target.folder.id), 'ごみ箱へ移動しました。');
          } else {
            void run(() => repo.trashFile(target.file.id), 'ごみ箱へ移動しました。');
          }
        }}
      />

      {/* 完全削除 */}
      <ConfirmDialog
        open={purgeTarget !== null}
        title="完全に削除しますか？"
        description={
          purgeTarget
            ? `「${purgeTarget.kind === 'folder' ? purgeTarget.folder.name : purgeTarget.file.name}」を完全に削除します。この操作は取り消せません。`
            : undefined
        }
        confirmLabel="完全に削除"
        tone="danger"
        onClose={() => setPurgeTarget(null)}
        onConfirm={() => {
          const target = purgeTarget;
          setPurgeTarget(null);
          if (!target) return;
          if (target.kind === 'folder') {
            void run(() => repo.purgeFolder(target.folder.id), '完全に削除しました。');
          } else {
            void run(() => repo.purgeFile(target.file.id), '完全に削除しました。');
          }
          void refreshStorage();
        }}
      />

      <ConfirmDialog
        open={emptyTrashConfirm}
        title="ごみ箱を空にしますか？"
        description="ごみ箱の中のPDFとフォルダーをすべて完全に削除します。この操作は取り消せません。"
        confirmLabel="空にする"
        tone="danger"
        onClose={() => setEmptyTrashConfirm(false)}
        onConfirm={() => {
          setEmptyTrashConfirm(false);
          void run(() => repo.emptyTrash(), 'ごみ箱を空にしました。').then(() => refreshStorage());
        }}
      />

      {/* 表示と並べ替え */}
      <SortSheet
        open={sortSheet}
        sortKey={settings.sortKey}
        viewMode={settings.viewMode}
        foldersFirst={settings.foldersFirst}
        onClose={() => setSortSheet(false)}
        onChange={(patch) => void updateSettings(patch)}
      />

      {/* フォルダー色 */}
      <ColorSheet
        open={colorTarget !== null}
        current={colorTarget?.kind === 'folder' ? colorTarget.folder.color : undefined}
        onClose={() => setColorTarget(null)}
        onSelect={(color: FolderColor) => {
          const target = colorTarget;
          setColorTarget(null);
          if (target?.kind !== 'folder') return;
          void run(() => repo.updateFolder(target.folder.id, { color }), '色を変更しました。');
        }}
      />

      {/* タグ・メモ */}
      <TagMemoSheet
        open={tagTarget !== null}
        file={tagTarget}
        knownTags={knownTags}
        onClose={() => setTagTarget(null)}
        onSave={(patch: { tags: string[]; memo: string; importance: Importance }) => {
          const target = tagTarget;
          setTagTarget(null);
          if (!target) return;
          void run(
            () =>
              repo.updateFile(target.id, {
                tags: patch.tags,
                memo: patch.memo,
                importance: patch.importance,
              }),
            '保存しました。',
          );
        }}
      />

      {/* 詳細情報 */}
      <DetailsSheet
        open={detailTarget !== null}
        file={detailTarget}
        path={detailTarget ? pathString(folders, toParentKey(detailTarget.parentId)) : ''}
        onClose={() => setDetailTarget(null)}
      />

      {/* 同名ファイル */}
      <DuplicateDialog
        open={duplicate !== null}
        fileName={duplicate?.name ?? ''}
        suggestedName={duplicate?.suggested ?? ''}
        remaining={duplicate?.remaining ?? 1}
        onClose={() => {
          duplicateResolver.current?.({ choice: 'cancel', applyToAll: false });
          duplicateResolver.current = null;
          setDuplicate(null);
        }}
        onChoose={(choice, applyToAll) => {
          duplicateResolver.current?.({ choice, applyToAll });
          duplicateResolver.current = null;
          setDuplicate(null);
        }}
      />

      {/* スキャン */}
      <ScanSheet
        open={scan !== null}
        mode={scan ?? 'camera'}
        onClose={() => setScan(null)}
        onError={(message) => notify(message, 'error')}
        onCreated={(blob, name) => {
          setScan(null);
          setPicker({ mode: 'import', sources: [{ blob, name }] });
        }}
      />

      {/* ビューアー */}
      {viewer ? (
        <PdfViewer
          file={viewer.file}
          blob={viewer.blob}
          onClose={() => setViewer(null)}
          onMenu={() => {
            const latest = files.find((file) => file.id === viewer.file.id) ?? viewer.file;
            setMenuItem({ kind: 'file', file: latest });
          }}
        />
      ) : null}

      {/* 初回チュートリアル */}
      {!settings.onboardingDone ? (
        <Onboarding onFinish={() => void updateSettings({ onboardingDone: true })} />
      ) : null}

      {/* 処理中（同名確認ダイアログを出している間は隠して操作をブロックしない） */}
      {busy && !duplicate ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(15,23,32,0.35)]">
          <div className="flex items-center gap-3 rounded-sheet bg-surface px-5 py-4 shadow-pop dark:bg-[#181e26]">
            <Spinner />
            <p className="text-base text-ink dark:text-[#e6eaef]">{busy}</p>
          </div>
        </div>
      ) : null}

      <Toasts />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 下部ナビゲーション                                                  */
/* ------------------------------------------------------------------ */

function BottomNav({
  current,
  onHome,
  onRecent,
  onAdd,
  onFavorites,
  onSettings,
}: {
  current: string;
  onHome: () => void;
  onRecent: () => void;
  onAdd: () => void;
  onFavorites: () => void;
  onSettings: () => void;
}) {
  const item = (
    key: string,
    label: string,
    Icon: typeof Home,
    onClick: () => void,
    active: boolean,
  ) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      className={cx(
        'flex min-h-tap flex-1 flex-col items-center justify-center gap-0.5 pt-1',
        active ? 'text-brand-500 dark:text-brand-300' : 'text-ink-sub dark:text-[#98a3b0]',
      )}
      aria-current={active ? 'page' : undefined}
    >
      <Icon size={22} strokeWidth={active ? 2.2 : 1.8} />
      <span className="text-xs">{label}</span>
    </button>
  );

  return (
    <nav
      aria-label="メインナビゲーション"
      className="fixed inset-x-0 bottom-0 z-30 border-t divider bg-surface/95 backdrop-blur dark:bg-[#181e26]/95"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
    >
      <div className="mx-auto flex h-[var(--bottom-nav-height)] max-w-3xl items-stretch">
        {item('home', 'ホーム', Home, onHome, current === 'home' || current === 'folder')}
        {item('recent', '最近', Clock, onRecent, current === 'recent')}

        <div className="relative flex w-20 shrink-0 items-start justify-center">
          <button
            type="button"
            onClick={onAdd}
            aria-label="PDFを追加"
            className="absolute -top-5 flex h-[58px] w-[58px] flex-col items-center justify-center rounded-full border-4 border-surface bg-brand-500 text-white shadow-fab active:bg-brand-600 dark:border-[#181e26]"
          >
            <Plus size={24} />
          </button>
          <span className="mt-[38px] text-xs text-ink-sub dark:text-[#98a3b0]">PDF追加</span>
        </div>

        {item('favorites', 'お気に入り', Star, onFavorites, current === 'favorites')}
        {item('settings', '設定', SettingsIcon, onSettings, current === 'settings')}
      </div>
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* トースト                                                            */
/* ------------------------------------------------------------------ */

function Toasts() {
  const { toasts, dismissToast } = useApp();
  if (toasts.length === 0) return null;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[90] flex flex-col items-center gap-2 px-4"
      style={{ bottom: 'calc(var(--bottom-nav-height) + var(--safe-bottom) + 20px)' }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={cx(
            'pointer-events-auto flex w-full max-w-md items-start gap-2 rounded-card px-3 py-2.5 text-sm shadow-pop',
            toast.tone === 'error'
              ? 'bg-pdf text-white'
              : toast.tone === 'success'
                ? 'bg-brand-600 text-white'
                : 'bg-[#2c353f] text-white',
          )}
        >
          <span className="flex-1 leading-relaxed">{toast.message}</span>
          <IconButton
            label="閉じる"
            className="-my-1.5 h-8 w-8 text-white/80"
            onClick={() => dismissToast(toast.id)}
          >
            <X size={16} />
          </IconButton>
        </div>
      ))}
    </div>
  );
}

export { Button };
