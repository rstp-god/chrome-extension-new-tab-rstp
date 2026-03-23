import { IMG_HEIGHT, IMG_QUALITY, IMG_WIDTH } from '@/newtab/components/Background/constants/constants.ts';

type WebpOptions = {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
};

export type WebpResult = {
  dataUrl: string;
  mime: "image/webp";
  width: number;
  height: number;
  bytes: number;
};

export async function processImageToWebp(file: File, opts: WebpOptions = {}): Promise<WebpResult> {
  const {
    maxWidth = IMG_WIDTH,
    maxHeight = IMG_HEIGHT,
    quality = IMG_QUALITY,
  } = opts;

  if (!file.type.startsWith("image/")) {
    throw new Error("Not an image file");
  }

  const bitmap = await createImageBitmap(file);

  const { targetW, targetH } = fitContain(bitmap.width, bitmap.height, maxWidth, maxHeight);

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context not available");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  ctx.drawImage(bitmap, 0, 0, targetW, targetH);

  const blob = await canvasToBlob(canvas, "image/webp", quality);
  const bytes = blob.size;

  const dataUrl = await blobToDataUrl(blob);

  bitmap.close?.();

  return {
    dataUrl,
    mime: "image/webp",
    width: targetW,
    height: targetH,
    bytes,
  };
}

function fitContain(srcW: number, srcH: number, maxW: number, maxH: number) {
  const ratio = Math.min(maxW / srcW, maxH / srcH, 1);
  return {
    targetW: Math.max(1, Math.round(srcW * ratio)),
    targetH: Math.max(1, Math.round(srcH * ratio)),
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
      type,
      quality
    );
  });
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("Failed to read blob"));
    fr.onload = () => resolve(String(fr.result));
    fr.readAsDataURL(blob);
  });
}
