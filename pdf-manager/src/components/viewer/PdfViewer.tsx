'use client';

/**
 * 全画面 PDF ビューアー。
 * pdf.js で 1 ページずつ canvas に描画し、拡大縮小・ページ移動に対応する。
 * ピンチ操作と、画面下部のコントロールの両方から操作できる。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Minus,
  Plus,
  X,
} from 'lucide-react';
import { releaseCanvas } from '@/lib/device';
import { openDocument, type PdfDocumentProxy } from '@/lib/pdf';
import { toMessage } from '@/lib/errors';
import type { PdfFileMeta } from '@/lib/types';
import { IconButton, Spinner, cx } from '@/components/ui/Primitives';

const MIN_SCALE = 0.5;
const MAX_SCALE = 5;

/**
 * canvas の上限。iOS Safari は 1 辺 4096px / 総面積 16.7M px を超えると
 * 描画結果を捨てて「真っ白なページ」になる。拡大時に静かに消えるのを防ぐため、
 * 上限を超えない範囲まで解像度 (ピクセル比) を落として必ず描画する。
 */
const MAX_CANVAS_SIDE = 4096;
const MAX_CANVAS_AREA = 16_777_216;

/** CSS サイズ (width x height) を描画できる最大のピクセル比を返す。 */
function safePixelRatio(width: number, height: number) {
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const bySide = Math.min(MAX_CANVAS_SIDE / width, MAX_CANVAS_SIDE / height);
  const byArea = Math.sqrt(MAX_CANVAS_AREA / (width * height));
  return Math.max(0.1, Math.min(ratio, bySide, byArea));
}

export function PdfViewer({
  file,
  blob,
  onClose,
  onMenu,
}: {
  file: PdfFileMeta;
  blob: Blob;
  onClose: () => void;
  onMenu: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const docRef = useRef<PdfDocumentProxy | null>(null);
  const renderTask = useRef<{ promise: Promise<void>; cancel: () => void } | null>(null);
  // 最後に開始した描画だけを有効にするための世代番号
  const renderSeq = useRef(0);
  // 破棄時に解放する canvas (アンマウント時は ref が外れているため保持しておく)
  const drawnCanvas = useRef<HTMLCanvasElement | null>(null);

  const [pageCount, setPageCount] = useState(file.pageCount ?? 0);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [fitWidthScale, setFitWidthScale] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [pageInput, setPageInput] = useState('1');

  /* 読み込み ---------------------------------------------------------- */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const doc = await openDocument(blob);
        if (cancelled) {
          void doc.destroy();
          return;
        }
        docRef.current = doc;
        setPageCount(doc.numPages);
        setLoading(false);
      } catch (loadError) {
        if (!cancelled) {
          setError(toMessage(loadError));
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      // 描画中に destroy するとワーカー側でエラーになるため、
      // キャンセルの完了を待ってから破棄する。
      renderSeq.current += 1;
      const task = renderTask.current;
      const doc = docRef.current;
      renderTask.current = null;
      docRef.current = null;
      task?.cancel();
      void Promise.resolve(task?.promise)
        .catch(() => undefined)
        .then(() => {
          // 拡大時の canvas は数十MBになる。iOS でメモリを抱えたままにしないよう明示的に解放する
          if (drawnCanvas.current) releaseCanvas(drawnCanvas.current);
          drawnCanvas.current = null;
          return doc?.destroy();
        })
        .catch(() => undefined);
    };
  }, [blob]);

  /* 描画 -------------------------------------------------------------- */
  const renderPage = useCallback(async () => {
    const doc = docRef.current;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!doc || !canvas || !container) return;

    const seq = renderSeq.current + 1;
    renderSeq.current = seq;

    // 進行中の描画はキャンセルし、終了を待ってから次を始める。
    // 待たずに同じ canvas へ描き始めると 2 つの描画が競合し、
    // 先に描かれた図形だけが残った中途半端なページになることがある。
    const previous = renderTask.current;
    if (previous) {
      previous.cancel();
      await previous.promise.catch(() => undefined);
      if (seq !== renderSeq.current) return;
    }

    try {
      const target = await doc.getPage(page);
      if (seq !== renderSeq.current) return;

      const base = target.getViewport({ scale: 1 });
      const available = container.clientWidth - 16;
      const fit = available > 0 ? available / base.width : 1;
      setFitWidthScale(fit);

      const viewport = target.getViewport({ scale: fit * scale });
      const dpr = safePixelRatio(viewport.width, viewport.height);
      canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
      canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      drawnCanvas.current = canvas;
      const context = canvas.getContext('2d');
      if (!context) return;
      // 背景 (白) の塗りつぶしは pdf.js が canvas 全体に対して行う。
      // 解像度は ctx の変換ではなく render の transform で渡す。
      // pdf.js は線幅や文字の描画方法の判断にこの値を使うため、
      // 事前に ctx へ変換を仕込む方法では正しく伝わらない。
      const task = target.render({
        canvasContext: context,
        viewport,
        transform: [dpr, 0, 0, dpr, 0, 0],
      });
      renderTask.current = task;
      await task.promise;
      if (seq === renderSeq.current) target.cleanup();
    } catch (renderError) {
      // ページ切り替えによるキャンセルはエラーではない
      const message = renderError instanceof Error ? renderError.message : '';
      if (seq === renderSeq.current && !/cancel/i.test(message)) setError(toMessage(renderError));
    }
  }, [page, scale]);

  useEffect(() => {
    if (loading || error) return;
    void renderPage();
  }, [error, loading, renderPage]);

  useEffect(() => {
    const onResize = () => void renderPage();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, [renderPage]);

  useEffect(() => {
    setPageInput(String(page));
  }, [page]);

  /* ピンチズーム ------------------------------------------------------ */
  const pinch = useRef<{ distance: number; scale: number } | null>(null);

  const onTouchStart = (event: React.TouchEvent) => {
    if (event.touches.length !== 2) return;
    const [a, b] = [event.touches[0], event.touches[1]];
    pinch.current = {
      distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
      scale,
    };
  };

  const onTouchMove = (event: React.TouchEvent) => {
    if (event.touches.length !== 2 || !pinch.current) return;
    const [a, b] = [event.touches[0], event.touches[1]];
    const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const next = (pinch.current.scale * distance) / pinch.current.distance;
    setScale(Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(next.toFixed(2)))));
  };

  const onTouchEnd = () => {
    pinch.current = null;
  };

  const changePage = (delta: number) => {
    setPage((current) => Math.min(pageCount || 1, Math.max(1, current + delta)));
    containerRef.current?.scrollTo({ top: 0 });
  };

  const zoom = (delta: number) => {
    setScale((current) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number((current + delta).toFixed(2)))));
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') changePage(1);
      if (event.key === 'ArrowLeft') changePage(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, pageCount]);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#20262d]">
      {/* ヘッダー */}
      <div
        className={cx(
          'flex shrink-0 items-center gap-1 bg-[#171c22] px-1 transition-transform',
          chromeVisible ? 'translate-y-0' : '-translate-y-full',
        )}
        style={{ paddingTop: 'var(--safe-top)' }}
      >
        <IconButton label="閉じる" onClick={onClose} className="text-white">
          <X size={22} />
        </IconButton>
        <p className="min-w-0 flex-1 truncate text-sm text-white">{file.name}</p>
        <IconButton label="操作メニュー" onClick={onMenu} className="text-white">
          <MoreVertical size={22} />
        </IconButton>
      </div>

      {/* 本文 */}
      <div
        ref={containerRef}
        onClick={() => setChromeVisible((value) => !value)}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className="sheet-scroll flex-1 overflow-auto bg-[#20262d] p-2"
      >
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner className="h-8 w-8 border-[#4a5563] border-t-white" />
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center px-8 text-center">
            <p className="text-base text-white">{error}</p>
          </div>
        ) : (
          <div className="flex min-h-full justify-center">
            <canvas ref={canvasRef} className="h-auto max-w-none shadow-pop" />
          </div>
        )}
      </div>

      {/* フッター操作 */}
      <div
        className={cx(
          'shrink-0 bg-[#171c22] transition-transform',
          chromeVisible ? 'translate-y-0' : 'translate-y-full',
        )}
        style={{ paddingBottom: 'var(--safe-bottom)' }}
      >
        <div className="flex items-center justify-between gap-1 px-1 py-1">
          <IconButton
            label="前のページ"
            onClick={() => changePage(-1)}
            disabled={page <= 1}
            className="text-white disabled:opacity-30"
          >
            <ChevronLeft size={24} />
          </IconButton>

          <div className="flex items-center gap-1.5 text-sm text-white">
            <input
              type="number"
              inputMode="numeric"
              value={pageInput}
              min={1}
              max={pageCount || 1}
              onChange={(event) => setPageInput(event.target.value)}
              onBlur={() => {
                const value = Number(pageInput);
                if (Number.isFinite(value) && value >= 1 && value <= (pageCount || 1)) {
                  setPage(Math.floor(value));
                } else {
                  setPageInput(String(page));
                }
              }}
              aria-label="ページ番号"
              className="h-9 w-16 rounded-[4px] border border-[#3a444f] bg-[#20262d] px-2 text-center text-white"
            />
            <span className="whitespace-nowrap">/ {pageCount || '-'} ページ</span>
          </div>

          <div className="flex items-center">
            <IconButton label="縮小" onClick={() => zoom(-0.25)} className="text-white">
              <Minus size={20} />
            </IconButton>
            <button
              type="button"
              onClick={() => setScale(1)}
              className="min-w-[52px] px-1 text-sm text-white"
              aria-label="表示倍率をリセット"
            >
              {Math.round(scale * fitWidthScale * 100) > 0
                ? `${Math.round(scale * 100)}%`
                : '100%'}
            </button>
            <IconButton label="拡大" onClick={() => zoom(0.25)} className="text-white">
              <Plus size={20} />
            </IconButton>
          </div>

          <IconButton
            label="次のページ"
            onClick={() => changePage(1)}
            disabled={pageCount > 0 && page >= pageCount}
            className="text-white disabled:opacity-30"
          >
            <ChevronRight size={24} />
          </IconButton>
        </div>
      </div>
    </div>
  );
}
