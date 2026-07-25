'use client';

/** 初回起動時のチュートリアル。 */
import { useState } from 'react';
import { FilePlus2, FolderPlus, Hand, Share2, ShieldCheck } from 'lucide-react';
import { Button, cx } from '@/components/ui/Primitives';

const STEPS = [
  {
    icon: FilePlus2,
    title: 'PDF追加ボタンからPDFを登録',
    body: '画面下中央の「PDF追加」から、端末のファイルアプリにあるPDFを選びます。複数まとめて選択できます。',
  },
  {
    icon: FolderPlus,
    title: 'フォルダーを作成して整理',
    body: 'パソコンのエクスプローラーと同じように、フォルダーの中にサブフォルダーを作って階層で整理できます。',
  },
  {
    icon: Hand,
    title: '長押しで名前変更や移動',
    body: 'PDFやフォルダーを長押し（または右側の「…」）すると、名前変更・移動・コピー・削除のメニューが開きます。',
  },
  {
    icon: Share2,
    title: '共有ボタンから端末に書き出す',
    body: 'PDFは共有シートから他のアプリへ送れます。iPhoneでは「ファイルに保存」、Androidではダウンロードや共有先の選択ができます。',
  },
  {
    icon: ShieldCheck,
    title: '大切なPDFはバックアップする',
    body: 'データはこの端末のブラウザー内に保存されます。設定画面からバックアップファイルを書き出しておくと安心です。',
  },
];

export function Onboarding({ onFinish }: { onFinish: () => void }) {
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  const Icon = step.icon;
  const last = index === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-surface dark:bg-[#11161c]">
      <div
        className="flex flex-1 flex-col items-center justify-center px-8 text-center"
        style={{ paddingTop: 'var(--safe-top)' }}
      >
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-card bg-brand-50 dark:bg-[#16233a]">
          <Icon size={40} className="text-brand-500" strokeWidth={1.6} />
        </div>
        <p className="text-sm font-medium text-brand-500">
          {index + 1} / {STEPS.length}
        </p>
        <h2 className="mt-2 text-xl font-semibold text-ink dark:text-[#e6eaef]">{step.title}</h2>
        <p className="mt-3 max-w-sm text-base leading-relaxed text-ink-sub dark:text-[#98a3b0]">
          {step.body}
        </p>
      </div>

      <div className="flex justify-center gap-1.5 pb-4">
        {STEPS.map((entry, position) => (
          <span
            key={entry.title}
            className={cx(
              'h-1.5 w-1.5 rounded-full',
              position === index ? 'bg-brand-500' : 'bg-line dark:bg-[#3a444f]',
            )}
          />
        ))}
      </div>

      <div
        className="flex gap-2 px-5 pb-5"
        style={{ paddingBottom: 'calc(20px + var(--safe-bottom))' }}
      >
        <Button variant="secondary" className="flex-1" onClick={onFinish}>
          スキップ
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          onClick={() => (last ? onFinish() : setIndex((value) => value + 1))}
        >
          {last ? 'はじめる' : '次へ'}
        </Button>
      </div>
    </div>
  );
}
