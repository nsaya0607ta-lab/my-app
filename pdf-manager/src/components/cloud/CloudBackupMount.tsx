'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '@/store/AppStore';
import { CloudBackupSettings } from './CloudBackupSettings';

/** 既存の設定画面の末尾へクラウドバックアップ欄を追加する。 */
export function CloudBackupMount() {
  const { route } = useApp();
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (route.view !== 'settings') {
      setHost(null);
      return;
    }
    const frame = requestAnimationFrame(() => setHost(document.querySelector('main')));
    return () => cancelAnimationFrame(frame);
  }, [route.view]);

  if (route.view !== 'settings' || !host) return null;
  return createPortal(<CloudBackupSettings />, host);
}
