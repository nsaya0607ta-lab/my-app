'use client';

/**
 * 全画面 PDF ビューアー。
 * pdf.js で 1 ページずつ canvas に描画し、拡大縮小・ページ移動に対応する。
 * ピンチ操作中は canvas の CSS transform だけを requestAnimationFrame で更新し、
 * 指を離した時点で最終倍率を 1 回だけ pdf.js の再描画へ反映する。
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

type ViewAnchor = {
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
};

type PinchState = {
  startDistance: number;
  startScale: number;
  previewScale: number;
  startMidX: number;
  startMidY: number;
  currentMidX: number;
  currentMidY: number;
  originX: number;
  originY: number;
  anchorX: number;
  anchorY: number;
};

type PinchPreview = {
  ratio: number;
  translateX: number;
  translateY: number;
};

const clampScale = (value: number) =>
  Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));

/** CSS サイズ (width x height) を描画できる最大のピクセル比を返す。 */
function safePixelRatio(width: number, height: number) {
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const bySide = Math.min(MAX_CANVAS_SIDE / width, MAX_CANVAS_SIDE / height);
  const byArea = Math.sqrt(MAX_CANVAS_AREA / (width * height));
  return Math.max(0.1, Math.min(ratio, bySide, byArea));
}

function midpoint(a: Touch, b: Touch) {
  return {
    x: (a.clientX + b.clientX) / 2,
    y: (a.clientY + b.clientY) / 2,
  };
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

  // ピンチ開始時の倍率を読むための控え (タッチ処理を毎回登録し直さないため)
  const scaleRef = useRef(scale);
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  /* 拡大時の表示位置 --------------------------------------------------- */
  // 拡大縮小の前後で「指の中心に見えていた場所」を保つためのしおり。
  // ボタン操作では画面中央、ピンチ操作では 2 本指の中点を基準にする。
  const anchor = useRef<ViewAnchor | null>(null);

  const captureAnchor = useCallback((clientX?: number, clientY?: number) => {
    const el = containerRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const offsetX =
      clientX == null
        ? el.clientWidth / 2
        : Math.min(el.clientWidth, Math.max(0, clientX - rect.left));
    const offsetY =
      clientY == null
        ? el.clientHeight / 2
        : Math.min(el.clientHeight, Math.max(0, clientY - rect.top));

    anchor.current = {
      x: (el.scrollLeft + offsetX) / Math.max(1, el.scrollWidth),
      y: (el.scrollTop + offsetY) / Math.max(1, el.scrollHeight),
      offsetX,
      offsetY,
    };
  }, []);

  const applyAnchor = useCallback(() => {
    const el = containerRef.current;
    const point = anchor.current;
    if (!el || !point) return;
    anchor.current = null;

    const maxLeft = Math.max(0, el.scrollWidth - el.clientWidth);
    const maxTop = Math.max(0, el.scrollHeight - el.clientHeight);
    el.scrollLeft = Math.min(
      maxLeft,
      Math.max(0, point.x * el.scrollWidth - point.offsetX),
    );
    el.scrollTop = Math.min(
      maxTop,
      Math.max(0, point.y * el.scrollHeight - point.offsetY),
    );
  }, []);

  /* 描画 -------------------------------------------------------------- */
  const renderPage = useCallback(async () => {
    const doc = docRef.current;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!doc || !canvas || !container) return;

    const seq = renderSeq.current + 1;
    renderSeq.current = seq;

    // 進行中の描画はキャンセルし、終了を待ってから次を始める。
    // ピンチ中は scale state を変更しないため、このキャンセルは指を離した後の 1 回だけになる。
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
      // 余白 (本文の p-2 = 左右 8px ずつ) を差し引いた幅にページを合わせる。
      const available = container.clientWidth - 16;
      const fit = available > 0 ? available / base.width : 1;

      const viewport = target.getViewport({ scale: fit * scale });
      const dpr = safePixelRatio(viewport.width, viewport.height);
      canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
      canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      // 大きさが変わった直後に、拡大前に見ていた場所へ戻す。
      applyAnchor();

      drawnCanvas.current = canvas;
      const context = canvas.getContext('2d');
      if (!context) return;
      const task = target.render({
        canvasContext: context,
        viewport,
        transform: [dpr, 0, 0, dpr, 0, 0],
      });
      renderTask.current = task;
      await task.promise;
      if (seq === renderSeq.current) {
        renderTask.current = null;
        target.cleanup();
      }
    } catch (renderError) {
      // ページ切り替えや倍率確定によるキャンセルはエラーではない
      const message = renderError instanceof Error ? renderError.message : '';
      if (seq === renderSeq.current && !/cancel/i.test(message)) {
        setError(toMessage(renderError));
      }
    }
  }, [applyAnchor, page, scale]);

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

  /* ピンチズームと指の移動 --------------------------------------------- */
  // 1本指 … ブラウザーの標準スクロールに任せる。
  // 2本指 … canvas の見た目だけを毎フレーム拡大し、指を離した時に最終倍率を 1 回だけ描画する。
  // touchmove ごとに setScale → pdf.js 再描画をしていた従来方式のカクつきを避ける。
  const pinch = useRef<PinchState | null>(null);
  const pinchFrame = useRef<number | null>(null);
  const pendingPreview = useRef<PinchPreview | null>(null);

  // 指を動かした直後のタップで、上下のバーが誤って開閉しないようにする
  const gestured = useRef(false);
  const moved = useRef(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const cancelPreviewFrame = useCallback(() => {
    if (pinchFrame.current != null) {
      cancelAnimationFrame(pinchFrame.current);
      pinchFrame.current = null;
    }
    pendingPreview.current = null;
  }, []);

  const clearCanvasPreview = useCallback(() => {
    cancelPreviewFrame();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.style.transform = '';
    canvas.style.transformOrigin = '';
    canvas.style.willChange = '';
  }, [cancelPreviewFrame]);

  const drawPinchPreview = useCallback(() => {
    pinchFrame.current = null;
    const canvas = canvasRef.current;
    const preview = pendingPreview.current;
    if (!canvas || !preview) return;
    pendingPreview.current = null;

    // GPU 合成だけで更新するため、pdf.js の再描画や React の再レンダーは発生しない。
    canvas.style.transform =
      `translate3d(${preview.translateX}px, ${preview.translateY}px, 0) ` +
      `scale(${preview.ratio})`;
  }, []);

  const finishPinch = useCallback(() => {
    const state = pinch.current;
    if (!state) return;

    const finalScale = Number(clampScale(state.previewScale).toFixed(2));
    const ratio = finalScale / Math.max(MIN_SCALE, state.startScale);
    const canvas = canvasRef.current;

    // ピンチ開始時に指の下にあった場所を、最後の 2 本指の中点へ残す。
    // 途中で 2 本指を動かした場合も、拡大と移動が同時に自然に確定する。
    const container = containerRef.current;
    if (container) {
      const rect = container.getBoundingClientRect();
      anchor.current = {
        x: state.anchorX,
        y: state.anchorY,
        offsetX: Math.min(
          container.clientWidth,
          Math.max(0, state.currentMidX - rect.left),
        ),
        offsetY: Math.min(
          container.clientHeight,
          Math.max(0, state.currentMidY - rect.top),
        ),
      };
    }

    // CSS transform を外す前にレイアウト上の大きさを最終倍率へ合わせる。
    // これにより、指を離した瞬間に元サイズへ一度戻る「跳ね」を防ぐ。
    if (canvas) {
      const width = Math.max(1, canvas.offsetWidth);
      const height = Math.max(1, canvas.offsetHeight);
      canvas.style.width = `${Math.max(1, Math.round(width * ratio))}px`;
      canvas.style.height = `${Math.max(1, Math.round(height * ratio))}px`;
    }

    clearCanvasPreview();
    pinch.current = null;

    // CSS サイズ変更後の scrollWidth / scrollHeight を使って直ちに位置を補正する。
    applyAnchor();

    scaleRef.current = finalScale;
    setScale((current) => (current === finalScale ? current : finalScale));
  }, [applyAnchor, clearCanvasPreview]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onStart = (event: TouchEvent) => {
      if (event.touches.length === 1) {
        // 新しい操作の始まり。前回のピンチ判定は持ち越さない。
        gestured.current = false;
        moved.current = false;
        touchStart.current = {
          x: event.touches[0].clientX,
          y: event.touches[0].clientY,
        };
        return;
      }

      if (event.touches.length !== 2) return;
      if (event.cancelable) event.preventDefault();

      gestured.current = true;
      touchStart.current = null;
      cancelPreviewFrame();

      const [a, b] = [event.touches[0], event.touches[1]];
      const mid = midpoint(a, b);
      const canvas = canvasRef.current;
      const rect = canvas?.getBoundingClientRect();
      const containerRect = el.getBoundingClientRect();
      const anchorOffsetX = Math.min(
        el.clientWidth,
        Math.max(0, mid.x - containerRect.left),
      );
      const anchorOffsetY = Math.min(
        el.clientHeight,
        Math.max(0, mid.y - containerRect.top),
      );

      pinch.current = {
        startDistance:
          Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1,
        startScale: scaleRef.current,
        previewScale: scaleRef.current,
        startMidX: mid.x,
        startMidY: mid.y,
        currentMidX: mid.x,
        currentMidY: mid.y,
        originX: rect ? mid.x - rect.left : 0,
        originY: rect ? mid.y - rect.top : 0,
        anchorX:
          (el.scrollLeft + anchorOffsetX) / Math.max(1, el.scrollWidth),
        anchorY:
          (el.scrollTop + anchorOffsetY) / Math.max(1, el.scrollHeight),
      };

      if (canvas) {
        canvas.style.transformOrigin =
          `${pinch.current.originX}px ${pinch.current.originY}px`;
        canvas.style.willChange = 'transform';
      }
    };

    const onMove = (event: TouchEvent) => {
      if (event.touches.length === 1) {
        const start = touchStart.current;
        if (start) {
          const dx = Math.abs(event.touches[0].clientX - start.x);
          const dy = Math.abs(event.touches[0].clientY - start.y);
          if (dx > 8 || dy > 8) moved.current = true;
        }
        return;
      }

      const state = pinch.current;
      if (event.touches.length !== 2 || !state) return;
      if (event.cancelable) event.preventDefault();

      const [a, b] = [event.touches[0], event.touches[1]];
      const distance = Math.hypot(
        a.clientX - b.clientX,
        a.clientY - b.clientY,
      );
      const mid = midpoint(a, b);
      const nextScale = clampScale(
        (state.startScale * distance) / state.startDistance,
      );

      state.previewScale = nextScale;
      state.currentMidX = mid.x;
      state.currentMidY = mid.y;

      pendingPreview.current = {
        ratio: nextScale / Math.max(MIN_SCALE, state.startScale),
        translateX: mid.x - state.startMidX,
        translateY: mid.y - state.startMidY,
      };

      // 端末の描画周期に合わせ、1 フレームにつき最大 1 回だけ transform を更新する。
      if (pinchFrame.current == null) {
        pinchFrame.current = requestAnimationFrame(drawPinchPreview);
      }
    };

    const onEnd = (event: TouchEvent) => {
      if (event.touches.length < 2 && pinch.current) finishPinch();
      if (event.touches.length === 0) touchStart.current = null;
    };

    // preventDefault を効かせるため passive: false で直接登録する。
    el.addEventListener('touchstart', onStart, { passive: false });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
      pinch.current = null;
      clearCanvasPreview();
    };
  }, [
    cancelPreviewFrame,
    clearCanvasPreview,
    drawPinchPreview,
    finishPinch,
  ]);

  /** 本文のタップ。指を動かした後やピンチ直後は開閉しない。 */
  const onSurfaceClick = () => {
    if (gestured.current || moved.current) {
      gestured.current = false;
      moved.current = false;
      return;
    }
    setChromeVisible((value) => !value);
  };

  const changePage = (delta: number) => {
    pinch.current = null;
    clearCanvasPreview();
    setPage((current) =>
      Math.min(pageCount || 1, Math.max(1, current + delta)),
    );
    anchor.current = null;
    containerRef.current?.scrollTo({ top: 0, left: 0 });
  };

  const zoom = (delta: number) => {
    pinch.current = null;
    clearCanvasPreview();
    captureAnchor();
    setScale((current) => {
      const next = Number(clampScale(current + delta).toFixed(2));
      scaleRef.current = next;
      return next;
    });
  };

  const resetZoom = () => {
    pinch.current = null;
    clearCanvasPreview();
    anchor.current = null;
    scaleRef.current = 1;
    setScale(1);
    containerRef.current?.scrollTo({ top: 0, left: 0 });
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
        onClick={onSurfaceClick}
        className="pdf-surface flex-1 overflow-auto bg-[#20262d]"
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
          // w-max + min-w-full：PDF が画面より大きいときは内容の幅まで広がり、
          // 左端まで確実にスクロールできる。小さいときは中央に置く。
          <div className="flex min-h-full w-max min-w-full items-start justify-center p-2">
            <canvas
              ref={canvasRef}
              className="block h-auto max-w-none shadow-pop"
            />
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
                if (
                  Number.isFinite(value) &&
                  value >= 1 &&
                  value <= (pageCount || 1)
                ) {
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
              onClick={resetZoom}
              className="min-w-[52px] px-1 text-sm text-white"
              aria-label="表示倍率をリセット"
            >
              {`${Math.round(scale * 100)}%`}
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
