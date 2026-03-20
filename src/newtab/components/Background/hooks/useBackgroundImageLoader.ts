import { loadBgImage } from '@/services/chrome/background.ts';
import { useCallback, useRef, useState } from 'react';

export function useBackgroundImageLoader() {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const cacheRef = useRef(new Map<string, string | null>());
  const reqIdRef = useRef(0);

  const load = useCallback(async (imageId: string | null) => {
    if (!imageId) {
      setDataUrl(null);
      return null;
    }

    if (cacheRef.current.has(imageId)) {
      const cached = cacheRef.current.get(imageId) ?? null;
      setDataUrl(cached);
      return cached;
    }

    const myReqId = ++reqIdRef.current;

    try {
      const url = await loadBgImage(imageId);
      if (reqIdRef.current !== myReqId) return null;

      cacheRef.current.set(imageId, url);
      setDataUrl(url);
      return url;
    } catch {
      if (reqIdRef.current !== myReqId) return null;

      cacheRef.current.set(imageId, null);
      setDataUrl(null);
      return null;
    }
  }, []);

  return { dataUrl, load };
}
