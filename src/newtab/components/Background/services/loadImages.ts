import { IMG_HEIGHT, IMG_QUALITY, IMG_WIDTH } from '@/newtab/components/Background/constants/constants.ts';
import { processImageToWebp } from '@/newtab/components/Background/services/webpConverter.ts';
import { assertImageFile } from '@/newtab/components/Background/utils/fileUpload.ts';
import { saveBackground, saveBgImage } from '@/services/chrome/background.ts';
import { BackgroundStateV1 } from '@/types/background.ts';

const uid = () => crypto.randomUUID();

export async function saveBackgroundFromFile(args: {
  file: File;
  current: BackgroundStateV1;
  maxMb?: number;
}): Promise<BackgroundStateV1> {
  const { file, current, maxMb = 12 } = args;

  assertImageFile(file, maxMb);

  const webp = await processImageToWebp(file, {
    maxWidth: IMG_WIDTH,
    maxHeight: IMG_HEIGHT,
    quality: IMG_QUALITY,
  });

  const id = uid();
  await saveBgImage(id, webp.dataUrl);

  const next: BackgroundStateV1 = {
    ...current,
    mode: "local",
    imageId: id,
  };

  await saveBackground(next);
  return next;
}

export async function clearBackground(args: {
  current: BackgroundStateV1;
}): Promise<BackgroundStateV1> {
  const next: BackgroundStateV1 = {
    ...args.current,
    mode: "none",
    imageId: null,
  };

  await saveBackground(next);
  return next;
}

export function buildPreviewStyle(args: {
  dataUrl: string | null;
  dim: number;
  blur: number;
  saturate: number;
}) {
  const { dataUrl, dim, blur, saturate } = args;

  const bg = dataUrl ? `url("${dataUrl}")` : "none";

  return {
    backgroundImage: `linear-gradient(to bottom, oklch(0 0 0 / ${dim}), oklch(0 0 0 / ${dim})), ${bg}`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    filter: `blur(${blur}px) saturate(${saturate})`,
  } as const;
}
