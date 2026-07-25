/**
 * pdf.js のラッパー。
 * ブラウザーでのみ動くため、すべて動的 import 経由で読み込む。
 */
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
  }) => { promise: Promise<void>; cancel: () => void };
  cleanup: () => void;
};

type PdfJsModule = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (options: { data: ArrayBuffer; disableAutoFetch?: boolean }) => {
    promise: Promise<PdfDocumentProxy>;
  };
};

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
    return await pdfjs.getDocument({ data }).promise;
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
  try {
    doc = await openDocument(blob);
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2, maxWidth / base.width);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
    page.cleanup();
    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), 'image/jpeg', 0.72);
    });
  } catch {
    return null;
  } finally {
    await doc?.destroy().catch(() => undefined);
  }
}

export type { PdfDocumentProxy, PdfPageProxy };
