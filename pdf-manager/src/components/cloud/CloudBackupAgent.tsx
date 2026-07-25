'use client';

/**
 * アプリの内容が変わったとき、30秒待ってからFirebaseへ自動バックアップする。
 * 連続操作中は待ち時間を延ばし、同じ内容を重複アップロードしない。
 */
import { useEffect, useState } from 'react';
import {
  createBackupSignature,
  readCloudBackupLocalState,
  uploadCloudBackup,
} from '@/lib/cloudBackup';
import { subscribeCloudAuth, type CloudUser } from '@/lib/firebaseCloud';
import { useApp } from '@/store/AppStore';

const AUTO_BACKUP_DELAY_MS = 30_000;

export function CloudBackupAgent() {
  const { ready, fatalError, folders, files, settings } = useApp();
  const [user, setUser] = useState<CloudUser | null>(null);
  const [onlineTick, setOnlineTick] = useState(0);

  // 自動バックアップがOFFの間はFirebase SDKを読み込まない。
  useEffect(() => {
    if (!settings.cloudBackupEnabled) {
      setUser(null);
      return;
    }
    return subscribeCloudAuth(setUser);
  }, [settings.cloudBackupEnabled]);

  useEffect(() => {
    const onOnline = () => setOnlineTick((value) => value + 1);
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  useEffect(() => {
    if (!ready || fatalError || !settings.cloudBackupEnabled || !user || !navigator.onLine) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    void createBackupSignature(folders, files, settings).then((signature) => {
      if (cancelled) return;
      const local = readCloudBackupLocalState();
      if (local.lastSignature === signature) return;

      timer = setTimeout(() => {
        if (cancelled || !navigator.onLine) return;
        void uploadCloudBackup(settings, signature).catch(() => {
          // エラーはローカル状態へ記録し、次回起動または再接続時に再試行する。
        });
      }, AUTO_BACKUP_DELAY_MS);
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [fatalError, files, folders, onlineTick, ready, settings, user]);

  return null;
}
