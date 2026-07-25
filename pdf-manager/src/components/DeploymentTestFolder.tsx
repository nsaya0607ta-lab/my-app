'use client';

import { useEffect } from 'react';
import * as repo from '@/lib/repository';
import { ROOT_ID } from '@/lib/types';
import { toParentKey } from '@/lib/tree';
import { useApp } from '@/store/AppStore';

const TEST_FOLDER_NAME = 'テスト';

/**
 * デプロイ反映確認用に、ルート直下へ「テスト」フォルダーを一度だけ作成する。
 * 既存のPDF・フォルダー・設定には触れない。
 */
export function DeploymentTestFolder() {
  const { ready, fatalError, reload } = useApp();

  useEffect(() => {
    if (!ready || fatalError) return;

    let cancelled = false;

    void (async () => {
      const snapshot = await repo.refresh();
      const alreadyExists = snapshot.folders.some(
        (folder) =>
          toParentKey(folder.parentId) === ROOT_ID && folder.name === TEST_FOLDER_NAME,
      );

      if (alreadyExists) return;

      await repo.createFolder(ROOT_ID, TEST_FOLDER_NAME);
      if (!cancelled) await reload();
    })().catch(() => {
      // 反映確認用フォルダーの作成に失敗しても、アプリ本体は継続して利用できる
    });

    return () => {
      cancelled = true;
    };
  }, [fatalError, ready, reload]);

  return null;
}
