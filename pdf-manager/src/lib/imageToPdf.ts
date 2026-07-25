/**
 * 画像 (カメラ撮影 / 端末内の写真) から PDF を生成する。
 * 端末が対応している画像形式は canvas でデコードできるので、
 * 一度 canvas に描いてから JPEG に統一して PDF へ埋め込む。
 */
import { AppError } from './errors';

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

async function toJpegBitmap(file: Blob): Promise<{ data: Uint8Array; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new AppError('IMAGE_CONVERT_FAILED'));
      element.src = url;
    });

    // 長辺 2000px を上限に縮小 (容量と処理時間のバランス)
    const maxEdge = 2000;
    const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new AppError('IMAGE_CONVERT_FAILED');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), 'image/jpeg', 0.85);
    });
    if (!blob) throw new AppError('IMAGE_CONVERT_FAILED');
    return { data: new Uint8Array(await blob.arrayBuffer()), width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 複数の画像を 1 つの PDF (A4 縦、余白付き) にまとめる。 */
export async function imagesToPdf(images: Blob[]): Promise<Blob> {
  if (images.length === 0) throw new AppError('IMAGE_CONVERT_FAILED');
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.create();

  for (const image of images) {
    const { data, width, height } = await toJpegBitmap(image);
    const embedded = await pdf.embedJpg(data);
    const page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
    const margin = 24;
    const maxWidth = A4_WIDTH - margin * 2;
    const maxHeight = A4_HEIGHT - margin * 2;
    const ratio = Math.min(maxWidth / width, maxHeight / height);
    const drawWidth = width * ratio;
    const drawHeight = height * ratio;
    page.drawImage(embedded, {
      x: (A4_WIDTH - drawWidth) / 2,
      y: (A4_HEIGHT - drawHeight) / 2,
      width: drawWidth,
      height: drawHeight,
    });
  }

  const bytes = await pdf.save();
  return new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
}
