import { assertImageFile, fileToDataUrl } from '@/newtab/components/Background/utils/fileUpload.ts';
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
  const dataUrl = await fileToDataUrl(file);

  const id = uid();
  await saveBgImage(id, dataUrl);

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
