'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  Cloud,
  CloudDownload,
  CloudUpload,
  LogIn,
  LogOut,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { restoreBackup, type RestoreMode } from '@/lib/backup';
import {
  CLOUD_STATE_EVENT,
  createBackupSignature,
  downloadLatestCloudBackup,
  getCloudBackupMetadata,
  readCloudBackupLocalState,
  uploadCloudBackup,
  type CloudBackupLocalState,
} from '@/lib/cloudBackup';
import {
  cloudErrorMessage,
  cloudSignIn,
  cloudSignOut,
  cloudSignUp,
  subscribeCloudAuth,
  type CloudUser,
} from '@/lib/firebaseCloud';
import { useApp } from '@/store/AppStore';
import { BottomSheet, MenuRow } from '@/components/ui/Sheet';
import { Button, SectionTitle, Spinner, Switch, cx } from '@/components/ui/Primitives';

function CloudRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-tap items-center justify-between gap-3 border-b divider px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-base text-ink dark:text-[#e6eaef]">{label}</p>
        {description ? (
          <p className="mt-0.5 whitespace-pre-line text-xs text-ink-sub dark:text-[#98a3b0]">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

const inputClass =
  'min-h-tap w-full rounded-card border border-line bg-surface px-3 text-base text-ink outline-none focus:border-brand-500 dark:border-[#333d49] dark:bg-[#1b222a] dark:text-[#e6eaef]';

function formatBackupAt(value?: string) {
  if (!value) return 'まだバックアップされていません';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function CloudBackupSettings() {
  const { settings, updateSettings, folders, files, reload, refreshStorage, notify } = useApp();
  const [user, setUser] = useState<CloudUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [localState, setLocalState] = useState<CloudBackupLocalState>(() =>
    readCloudBackupLocalState(),
  );
  const [remoteAt, setRemoteAt] = useState<string | undefined>();
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreMode, setRestoreMode] = useState<RestoreMode>('replace');

  useEffect(
    () =>
      subscribeCloudAuth((nextUser) => {
        setUser(nextUser);
        setAuthReady(true);
        if (nextUser?.email) setEmail(nextUser.email);
      }),
    [],
  );

  useEffect(() => {
    const onState = (event: Event) => {
      const detail = (event as CustomEvent<CloudBackupLocalState>).detail;
      setLocalState(detail || readCloudBackupLocalState());
      if (detail?.lastAt) setRemoteAt(detail.lastAt);
    };
    window.addEventListener(CLOUD_STATE_EVENT, onState);
    return () => window.removeEventListener(CLOUD_STATE_EVENT, onState);
  }, []);

  useEffect(() => {
    if (!user) {
      setRemoteAt(undefined);
      return;
    }
    void getCloudBackupMetadata()
      .then((metadata) => setRemoteAt(metadata?.updatedAt))
      .catch(() => undefined);
  }, [user]);

  const authenticate = async (mode: 'login' | 'signup') => {
    if (!email.trim()) return notify('メールアドレスを入力してください。', 'error');
    if (password.length < 6) return notify('パスワードは6文字以上で入力してください。', 'error');
    setBusy(mode);
    try {
      if (mode === 'signup') await cloudSignUp(email, password);
      else await cloudSignIn(email, password);
      setPassword('');
      notify(mode === 'signup' ? 'クラウド用アカウントを作成しました。' : 'クラウドへログインしました。', 'success');
    } catch (error) {
      notify(cloudErrorMessage(error), 'error');
    } finally {
      setBusy(null);
    }
  };

  const backupNow = async () => {
    setBusy('backup');
    try {
      const signature = await createBackupSignature(folders, files, settings);
      const metadata = await uploadCloudBackup(settings, signature);
      setRemoteAt(metadata.updatedAt);
      notify('クラウドへバックアップしました。', 'success');
    } catch (error) {
      notify(cloudErrorMessage(error), 'error');
    } finally {
      setBusy(null);
    }
  };

  const restoreFromCloud = async () => {
    setBusy('restore');
    try {
      const blob = await downloadLatestCloudBackup();
      const result = await restoreBackup(blob, restoreMode);
      await reload();
      await refreshStorage();
      setRestoreOpen(false);
      notify(`クラウドから復元しました（フォルダー ${result.folders} 件 / PDF ${result.files} 件）`, 'success');
    } catch (error) {
      notify(cloudErrorMessage(error), 'error');
    } finally {
      setBusy(null);
    }
  };

  const lastAt = remoteAt || localState.lastAt;

  return (
    <>
      <SectionTitle>クラウドバックアップ</SectionTitle>
      <div className="bg-surface dark:bg-[#181e26]">
        {!authReady ? (
          <div className="flex items-center justify-center py-8">
            <Spinner />
          </div>
        ) : !user ? (
          <div className="space-y-3 px-4 py-4">
            <div className="flex gap-2 text-sm leading-relaxed text-ink-sub dark:text-[#98a3b0]">
              <Cloud size={20} className="mt-0.5 shrink-0 text-brand-500" />
              <p>
                Firebaseへログインすると、フォルダー構成とPDF本体をまとめて保存できます。
                学習アプリで使っているメールアドレスとパスワードでもログインできます。
              </p>
            </div>
            <label className="block space-y-1">
              <span className="text-xs text-ink-sub dark:text-[#98a3b0]">メールアドレス</span>
              <input
                className={inputClass}
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-ink-sub dark:text-[#98a3b0]">パスワード</span>
              <input
                className={inputClass}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void authenticate('login');
                }}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="primary"
                disabled={busy !== null}
                onClick={() => void authenticate('login')}
              >
                {busy === 'login' ? <Spinner className="border-white/40 border-t-white" /> : <LogIn size={18} />}
                ログイン
              </Button>
              <Button
                variant="secondary"
                disabled={busy !== null}
                onClick={() => void authenticate('signup')}
              >
                {busy === 'signup' ? <Spinner /> : <UserPlus size={18} />}
                新規登録
              </Button>
            </div>
          </div>
        ) : (
          <>
            <CloudRow label="ログイン中" description={user.email || user.uid}>
              <ShieldCheck size={20} className="text-brand-500" />
            </CloudRow>
            <CloudRow
              label="自動バックアップ"
              description="PDF・フォルダー・タグ・メモなどの変更から約30秒後に保存します"
            >
              <Switch
                checked={settings.cloudBackupEnabled}
                onChange={(value) => void updateSettings({ cloudBackupEnabled: value })}
                label="Firebaseへ自動バックアップする"
              />
            </CloudRow>
            <CloudRow
              label="最終バックアップ"
              description={`${formatBackupAt(lastAt)}\n過去30日分を日別に保持します`}
            >
              <Cloud size={20} className="text-ink-sub" />
            </CloudRow>
            <div className="grid gap-2 px-4 py-4">
              <Button variant="primary" disabled={busy !== null} onClick={() => void backupNow()}>
                {busy === 'backup' ? <Spinner className="border-white/40 border-t-white" /> : <CloudUpload size={18} />}
                今すぐクラウドへバックアップ
              </Button>
              <Button variant="secondary" disabled={busy !== null || !lastAt} onClick={() => setRestoreOpen(true)}>
                {busy === 'restore' ? <Spinner /> : <CloudDownload size={18} />}
                クラウドから復元
              </Button>
              <Button
                variant="ghost"
                disabled={busy !== null}
                onClick={() => {
                  void cloudSignOut()
                    .then(() => notify('クラウドからログアウトしました。', 'success'))
                    .catch((error) => notify(cloudErrorMessage(error), 'error'));
                }}
              >
                <LogOut size={18} />
                ログアウト
              </Button>
            </div>
            {localState.lastError ? (
              <p className="border-t divider px-4 py-3 text-xs text-pdf">
                前回の自動バックアップ: {localState.lastError}
              </p>
            ) : null}
          </>
        )}
      </div>

      <BottomSheet
        open={restoreOpen}
        title="クラウドから復元"
        description="復元方法を選んでください。置き換える場合、現在の端末内データはバックアップ時点の内容に変わります。"
        onClose={() => setRestoreOpen(false)}
        footer={
          <Button
            variant="primary"
            className="w-full"
            disabled={busy !== null}
            onClick={() => void restoreFromCloud()}
          >
            {busy === 'restore' ? <Spinner className="border-white/40 border-t-white" /> : null}
            復元する
          </Button>
        }
      >
        <MenuRow
          icon={
            <span
              className={cx(
                'h-2.5 w-2.5 rounded-full',
                restoreMode === 'replace' ? 'bg-brand-500' : 'bg-line',
              )}
            />
          }
          label="バックアップ時点の状態へ置き換える"
          description="機種変更・データ消失からの復旧に適しています"
          onClick={() => setRestoreMode('replace')}
        />
        <MenuRow
          icon={
            <span
              className={cx(
                'h-2.5 w-2.5 rounded-full',
                restoreMode === 'merge' ? 'bg-brand-500' : 'bg-line',
              )}
            />
          }
          label="現在のデータへ追加する"
          description="同じIDのPDF・フォルダーはスキップします"
          onClick={() => setRestoreMode('merge')}
        />
      </BottomSheet>
    </>
  );
}
