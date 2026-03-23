import { getGreeting } from '@/newtab/components/Header/utils/getGreetings.ts';
import { applyTheme } from '@/newtab/components/Header/utils/theme.ts';
import { loadHeaderSettings, saveHeaderSettings } from '@/services/chrome/header.ts';
import { DEFAULT_HEADER_SETTINGS, HeaderSettingsV1 } from '@/types/header.ts';
import { useCallback, useEffect, useMemo, useState } from 'react';

export function useHeaderState() {
  const [ settings, setSettings ] = useState<HeaderSettingsV1>(DEFAULT_HEADER_SETTINGS);
  const [ ready, setReady ] = useState(false);

  const displayName = useMemo(() => {
    const n = settings.displayName?.trim() ?? "";
    return n ? n : "Гость";
  }, [ settings.displayName ]);

  const greeting = useMemo(() => getGreeting(), []);

  const persist = useCallback(async (next: HeaderSettingsV1) => {
    await saveHeaderSettings(next);
    setSettings(next);
    applyTheme(next.theme);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const loaded = await loadHeaderSettings();
      if (cancelled) return;

      setSettings(loaded);
      applyTheme(loaded.theme);
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [ settings, setSettings ]);

  return { ready, settings, displayName, greeting, persist };
}
