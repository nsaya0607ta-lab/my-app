/**
 * pdf.js のラッパー。
 * ブラウザーでのみ動くため、すべて動的 import 経由で読み込む。
 */
import { releaseCanvas } from './device';
import { AppError } from './errors';

type PdfDocumentProxy = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPageProxy>;
  getMetadata: () => Promise<{ info?: Record<string, unknown> }>;
  destroy: () => Promise<void>;
};

type PdfPageProxy = {
  getViewport: (options: { scale: number; rotation?: number }) => {
    width: number;
    height: number;
  };
  render: (options: {
    canvasContext: CanvasRenderingContext2D;
    viewport: unknown;
    /** 高解像度描画用のスケール。pdf.js へ明示的に伝える (詳細は PdfViewer)。 */
    transform?: [number, number, number, number, number, number];
  }) => { promise: Promise<void>; cancel: () => void };
  cleanup: () => void;
};

type PdfJsModule = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (options: {
    data: ArrayBuffer;
    disableAutoFetch?: boolean;
    cMapUrl?: string;
    cMapPacked?: boolean;
    standardFontDataUrl?: string;
    wasmUrl?: string;
    iccUrl?: string;
  }) => {
    promise: Promise<PdfDocumentProxy>;
  };
};

/**
 * pdf.js が実行時に fetch する外部データの置き場所。
 * scripts/prepare-assets.mjs が public/pdfjs/ 配下へコピーする。
 * 末尾のスラッシュは pdf.js の必須要件 (無いと例外になる)。
 */
const PDFJS_ASSET_BASE = '/pdfjs/';

/**
 * CMap と標準フォントを渡さないと、日本語 PDF でよく使われる
 * 定義済み CMap (UniJIS-UCS2-H など) や非埋め込みフォントを解決できず、
 * 文字がまったく描画されない (罫線だけの PDF に見える)。
 */
const ASSET_OPTIONS = {
  cMapUrl: `${PDFJS_ASSET_BASE}cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${PDFJS_ASSET_BASE}standard_fonts/`,
  wasmUrl: `${PDFJS_ASSET_BASE}wasm/`,
  iccUrl: `${PDFJS_ASSET_BASE}iccs/`,
} as const;

let modulePromise: Promise<PdfJsModule> | null = null;

async function loadPdfJs(): Promise<PdfJsModule> {
  if (typeof window === 'undefined') throw new AppError('PDF_READ_FAILED');
  if (!modulePromise) {
    modulePromise = import('pdfjs-dist/legacy/build/pdf.mjs').then((mod) => {
      const pdfjs = mod as unknown as PdfJsModule;
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      return pdfjs;
    });
  }
  return modulePromise;
}

export async function openDocument(blob: Blob): Promise<PdfDocumentProxy> {
  try {
    const pdfjs = await loadPdfJs();
    const data = await blob.arrayBuffer();
    return await pdfjs.getDocument({ data, ...ASSET_OPTIONS }).promise;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('PDF_READ_FAILED', error instanceof Error ? error.message : undefined);
  }
}

/** ページ数だけを取得する (取り込み時に使用)。失敗しても致命傷にしない。 */
export async function getPageCount(blob: Blob): Promise<number | undefined> {
  let doc: PdfDocumentProxy | undefined;
  try {
    doc = await openDocument(blob);
    return doc.numPages;
  } catch {
    return undefined;
  } finally {
    await doc?.destroy().catch(() => undefined);
  }
}

/** 1 ページ目からサムネイル (JPEG Blob) を作る。 */
export async function renderThumbnail(blob: Blob, maxWidth = 320): Promise<Blob | null> {
  let doc: PdfDocumentProxy | undefined;
  let canvas: HTMLCanvasElement | undefined;
  try {
    doc = await openDocument(blob);
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2, maxWidth / base.width);
    const viewport = page.getViewport({ scale });
    const target = document.createElement('canvas');
    canvas = target;
    target.width = Math.max(1, Math.floor(viewport.width));
    target.height = Math.max(1, Math.floor(viewport.height));
    const context = target.getContext('2d');
    if (!context) return null;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, target.width, target.height);
    await page.render({ canvasContext: context, viewport }).promise;
    page.cleanup();
    return await new Promise<Blob | null>((resolve) => {
      target.toBlob((result) => resolve(result), 'image/jpeg', 0.72);
    });
  } catch {
    return null;
  } finally {
    // 取り込み時に何十枚も作るため、iOS の canvas メモリ上限に達しないよう毎回解放する
    if (canvas) releaseCanvas(canvas);
    await doc?.destroy().catch(() => undefined);
  }
}

export type { PdfDocumentProxy, PdfPageProxy };
