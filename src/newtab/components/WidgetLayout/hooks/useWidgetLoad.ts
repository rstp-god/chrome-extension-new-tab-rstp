import { DEFAULT_INSTANCES } from '@/newtab/components/WidgetLayout/constants/constants.ts';
import { loadWidgetsLayout, saveWidgetsLayout } from '@/services/chrome/layout.ts';
import { WidgetInstance } from '@/types/widgets.ts';
import { useCallback, useEffect, useState } from 'react';

export function useWidgetLoad() {
  const [ layout, setLayout ] = useState<WidgetInstance[]>(DEFAULT_INSTANCES);

  useEffect(() => {
    (async () => {
      const data= await loadWidgetsLayout();
      if (data) {
        setLayout(data);
      }
    })()
  }, []);

  const persist = useCallback(async (next: WidgetInstance[]) => {
    await saveWidgetsLayout(next);
  }, [])

  return {
    layout,
    persist
  };
}
