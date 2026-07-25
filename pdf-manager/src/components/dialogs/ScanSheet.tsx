'use client';

/**
 * カメラ撮影 / 端末内の画像から PDF を作成する。
 * 撮った順にページとして積み上げ、最後にまとめて 1 つの PDF へ変換する。
 */
import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, Trash2 } from 'lucide-react';
import { imagesToPdf } from '@/lib/imageToPdf';
import { toMessage } from '@/lib/errors';
import { Button, Spinner } from '@/components/ui/Primitives';
import { BottomSheet } from '@/components/ui/Sheet';

type Page = { id: string; blob: Blob; url: string };

export function ScanSheet({
  open,
  mode,
  onClose,
  onCreated,
  onError,
}: {
  open: boolean;
  /** camera: 撮影して追加 / gallery: 端末内の画像を選択 */
  mode: 'camera' | 'gallery';
  onClose: () => void;
  onCreated: (blob: Blob, suggestedName: string) => void;
  onError: (message: string) => void;
}) {
  const [pages, setPages] = useState<Page[]>([]);
  const [busy, setBusy] = useState(false);
  const cameraInput = useRef<HTMLInputElement | null>(null);
  const galleryInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) return;
    setPages((current) => {
      for (const page of current) URL.revokeObjectURL(page.url);
      return [];
    });
  }, [open]);

  // シートを開いた直後に、その場で選択画面を出す
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      if (mode === 'camera') cameraInput.current?.click();
      else galleryInput.current?.click();
    }, 120);
    return () => clearTimeout(timer);
  }, [mode, open]);

  const addImages = (fileList: FileList | null) => {
    if (!fileList) return;
    const added: Page[] = [];
    for (const file of Array.from(fileList)) {
      if (!file.type.startsWith('image/')) continue;
      added.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        blob: file,
        url: URL.createObjectURL(file),
      });
    }
    if (added.length === 0) {
      onError('画像ファイルを選択してください。');
      return;
    }
    setPages((current) => [...current, ...added]);
  };

  const removePage = (id: string) => {
    setPages((current) => {
      const target = current.find((page) => page.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return current.filter((page) => page.id !== id);
    });
  };

  const create = async () => {
    if (pages.length === 0) return;
    setBusy(true);
    try {
      const blob = await imagesToPdf(pages.map((page) => page.blob));
      const stamp = new Date();
      const name = `スキャン ${stamp.getFullYear()}-${`${stamp.getMonth() + 1}`.padStart(2, '0')}-${`${stamp.getDate()}`.padStart(2, '0')} ${`${stamp.getHours()}`.padStart(2, '0')}${`${stamp.getMinutes()}`.padStart(2, '0')}.pdf`;
      onCreated(blob, name);
    } catch (error) {
      onError(toMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      title={mode === 'camera' ? 'カメラでスキャン' : '画像からPDFを作成'}
      description={
        pages.length === 0
          ? mode === 'camera'
            ? '書類を撮影すると、そのままPDFのページになります。'
            : '端末内の画像を選ぶと、選んだ順にPDFのページになります。'
          : `${pages.length} ページ`
      }
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() =>
              mode === 'camera' ? cameraInput.current?.click() : galleryInput.current?.click()
            }
          >
            {mode === 'camera' ? <Camera size={18} /> : <ImagePlus size={18} />}
            {mode === 'camera' ? '続けて撮影' : '画像を追加'}
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            disabled={pages.length === 0 || busy}
            onClick={() => void create()}
          >
            {busy ? <Spinner className="h-4 w-4 border-white/40 border-t-white" /> : null}
            PDFを作成
          </Button>
        </div>
      }
    >
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          addImages(event.target.files);
          event.target.value = '';
        }}
      />
      <input
        ref={galleryInput}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          addImages(event.target.files);
          event.target.value = '';
        }}
      />

      {pages.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-ink-sub dark:text-[#98a3b0]">
          まだページがありません。
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2 p-4">
          {pages.map((page, index) => (
            <div key={page.id} className="relative">
              {/* 選択直後のプレビューは Blob URL のため img を使う */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={page.url}
                alt={`${index + 1}ページ目`}
                className="h-32 w-full rounded-card border border-line object-cover dark:border-[#333d49]"
              />
              <span className="absolute left-1 top-1 rounded-[3px] bg-[rgba(15,23,32,0.7)] px-1.5 py-0.5 text-xs text-white">
                {index + 1}
              </span>
              <button
                type="button"
                aria-label={`${index + 1}ページ目を削除`}
                onClick={() => removePage(page.id)}
                className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-[4px] bg-[rgba(15,23,32,0.7)] text-white"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </BottomSheet>
  );
}
