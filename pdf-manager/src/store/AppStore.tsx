'use client';

/**
 * アプリ全体の状態を持つストア。
 *
 * フォルダーと PDF の「メタデータ」だけをメモリに載せ、PDF 本体 (Blob) は
 * 必要になったときだけ IndexedDB から読み出す。書き込みは必ず repository を
 * 経由し、そのあと再読み込みして UI に反映する。
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { estimateStorage, isIndexedDbAvailable, readThumb, writeThumb } from '@/lib/db';
import { isIos } from '@/lib/device';
import { toMessage } from '@/lib/errors';
import * as repo from '@/lib/repository';
import { renderThumbnail } from '@/lib/pdf';
import { DEFAULT_SETTINGS, ROOT_ID, type Folder, type PdfFileMeta, type Settings } from '@/lib/types';
import { toParentKey } from '@/lib/tree';

export type Route =
  | { view: 'home' }
  | { view: 'folder'; folderId: string }
  | { view: 'recent' }
  | { view: 'favorites' }
  | { view: 'trash' }
  | { view: 'settings' }
  | { view: 'search' };

export type Toast = { id: number; message: string; tone: 'info' | 'error' | 'success' };

type AppState = {
  ready: boolean;
  fatalError: string | null;
  folders: Folder[];
  files: PdfFileMeta[];
  settings: Settings;
  route: Route;
  canGoBack: boolean;
  canGoForward: boolean;
  toasts: Toast[];
  storage: { usage: number; quota: number } | null;
};

type AppActions = {
  navigate: (route: Route) => void;
  goBack: () => void;
  goForward: () => void;
  goHome: () => void;
  goUp: () => void;
  reload: () => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  notify: (message: string, tone?: Toast['tone']) => void;
  dismissToast: (id: number) => void;
  run: <T>(task: () => Promise<T>, successMessage?: string) => Promise<T | undefined>;
  refreshStorage: () => Promise<void>;
  getThumbnail: (fileId: string) => Promise<string | null>;
};

const AppContext = createContext<(AppState & AppActions) | null>(null);

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('AppProvider の外側で useApp が呼ばれました');
  return value;
}

let toastSeq = 0;

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<PdfFileMeta[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [route, setRoute] = useState<Route>({ view: 'home' });
  const [back, setBack] = useState<Route[]>([]);
  const [forward, setForward] = useState<Route[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);

  const thumbUrls = useRef(new Map<string, string>());
  const thumbJobs = useRef(new Map<string, Promise<string | null>>());

  const notify = useCallback((message: string, tone: Toast['tone'] = 'info') => {
    if (!message) return;
    const id = (toastSeq += 1);
    setToasts((current) => [...current.slice(-2), { id, message, tone }]);
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4200);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const reload = useCallback(async () => {
    const snapshot = await repo.refresh();
    setFolders(snapshot.folders);
    setFiles(snapshot.files);
  }, []);

  const refreshStorage = useCallback(async () => {
    setStorage(await estimateStorage());
  }, []);

  /** 例外を握って日本語メッセージに変換する共通ラッパー。 */
  const run = useCallback(
    async <T,>(task: () => Promise<T>, successMessage?: string): Promise<T | undefined> => {
      try {
        const result = await task();
        await reload();
        if (successMessage) notify(successMessage, 'success');
        return result;
      } catch (error) {
        const message = toMessage(error);
        if (message) notify(message, 'error');
        return undefined;
      }
    },
    [notify, reload],
  );

  /* 初期化 ------------------------------------------------------------ */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isIndexedDbAvailable()) {
        setFatalError(
          'この環境ではデータを保存できません（IndexedDBが利用できません）。プライベートブラウズを解除するか、別のブラウザーでお試しください。',
        );
        setReady(true);
        return;
      }
      try {
        const snapshot = await repo.bootstrap();
        if (cancelled) return;
        setFolders(snapshot.folders);
        setFiles(snapshot.files);
        setSettings(snapshot.settings);
        setReady(true);

        const purged = await repo.purgeExpiredTrash(snapshot.settings.trashRetentionDays);
        if (purged > 0 && !cancelled) {
          await reload();
        }
        void refreshStorage();
      } catch (error) {
        if (!cancelled) {
          setFatalError(toMessage(error));
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reload, refreshStorage]);

  /* テーマ ------------------------------------------------------------ */
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && media.matches);
      root.classList.toggle('dark', dark);
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', dark ? '#11161c' : '#f4f6f8');
      // 次回起動時のちらつきを防ぐため、テーマ設定だけ localStorage にも保存する
      try {
        localStorage.setItem('pdf-folder-theme', settings.theme);
      } catch {
        /* 保存できない環境では無視 */
      }
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [settings.theme]);

  /* 画面遷移 ---------------------------------------------------------- */
  const navigate = useCallback(
    (next: Route) => {
      setBack((current) => [...current.slice(-49), route]);
      setForward([]);
      setRoute(next);
    },
    [route],
  );

  const goBack = useCallback(() => {
    setBack((current) => {
      if (current.length === 0) return current;
      const previous = current[current.length - 1];
      setForward((f) => [...f, route]);
      setRoute(previous);
      return current.slice(0, -1);
    });
  }, [route]);

  const goForward = useCallback(() => {
    setForward((current) => {
      if (current.length === 0) return current;
      const next = current[current.length - 1];
      setBack((b) => [...b, route]);
      setRoute(next);
      return current.slice(0, -1);
    });
  }, [route]);

  const goHome = useCallback(() => {
    navigate({ view: 'home' });
  }, [navigate]);

  const goUp = useCallback(() => {
    if (route.view !== 'folder') {
      goHome();
      return;
    }
    const current = folders.find((folder) => folder.id === route.folderId);
    const parentId = toParentKey(current?.parentId);
    navigate(parentId === ROOT_ID ? { view: 'home' } : { view: 'folder', folderId: parentId });
  }, [folders, goHome, navigate, route]);

  /* Android の戻るボタン対応 ------------------------------------------ */
  useEffect(() => {
    window.history.replaceState({ app: true }, '');
    const onPopState = () => {
      // 戻るジェスチャーでアプリが閉じないよう、履歴を積み直す
      window.history.pushState({ app: true }, '');
      // iPhone / iPad では画面端の横スワイプが popstate になる。
      // 意図しない画面移動になるため、履歴を積み直すだけで画面は動かさない。
      // (画面の移動はヘッダーの戻る/進むボタンで行う)
      if (isIos()) return;
      goBack();
    };
    window.history.pushState({ app: true }, '');
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [goBack]);

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      const next = { ...settings, ...patch };
      setSettings(next);
      try {
        await repo.saveSettings(next);
      } catch (error) {
        notify(toMessage(error), 'error');
      }
    },
    [notify, settings],
  );

  /* サムネイル -------------------------------------------------------- */
  const getThumbnail = useCallback(async (fileId: string): Promise<string | null> => {
    const cached = thumbUrls.current.get(fileId);
    if (cached) return cached;
    const running = thumbJobs.current.get(fileId);
    if (running) return running;

    const job = (async () => {
      try {
        let blob = await readThumb(fileId);
        if (!blob) {
          const source = await repo.readBlob(fileId);
          if (!source) return null;
          const rendered = await renderThumbnail(source);
          if (!rendered) return null;
          await writeThumb(fileId, rendered);
          blob = rendered;
        }
        const url = URL.createObjectURL(blob);
        thumbUrls.current.set(fileId, url);
        return url;
      } catch {
        return null;
      } finally {
        thumbJobs.current.delete(fileId);
      }
    })();

    thumbJobs.current.set(fileId, job);
    return job;
  }, []);

  useEffect(() => {
    const urls = thumbUrls.current;
    return () => {
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  const value = useMemo<AppState & AppActions>(
    () => ({
      ready,
      fatalError,
      folders,
      files,
      settings,
      route,
      canGoBack: back.length > 0,
      canGoForward: forward.length > 0,
      toasts,
      storage,
      navigate,
      goBack,
      goForward,
      goHome,
      goUp,
      reload,
      updateSettings,
      notify,
      dismissToast,
      run,
      refreshStorage,
      getThumbnail,
    }),
    [
      back.length,
      dismissToast,
      files,
      fatalError,
      folders,
      forward.length,
      getThumbnail,
      goBack,
      goForward,
      goHome,
      goUp,
      navigate,
      notify,
      ready,
      refreshStorage,
      reload,
      route,
      run,
      settings,
      storage,
      toasts,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
