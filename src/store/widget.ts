import { ChromeSyncActions, withChromeSync } from '@/services/chrome/zustandChromeSync.ts';
import { layoutItemSchema } from '@/services/zod/zodCommon.ts';
import { makeEnvelopeSchema } from '@/services/zod/zodEnvelop.ts';
import { DEFAULT_INSTANCES, WIDGET_LAYOUT_KEY, WidgetInstance, Widgets } from '@/types/widgets.ts';
import { z } from 'zod';
import { create } from 'zustand/react';

interface WidgetStore extends Widgets {
  setWidgets: (widgets: WidgetInstance[]) => void;
}

const widgetInstanceShema = z.object({
  id: z.string(),
  title: z.string(),
  layout: layoutItemSchema,
  widgetType: z.union([ z.literal('search') ])
})
const widgetStoreSchema = z.object({
  widgets: z.array(widgetInstanceShema),
  layout: z.array(layoutItemSchema),
})
const widgetEnvelopeSchema = makeEnvelopeSchema(widgetStoreSchema);

export const useWidgetStore = create<WidgetStore & ChromeSyncActions>()(
  withChromeSync<WidgetStore, Widgets>({
    key: WIDGET_LAYOUT_KEY,
    schema: widgetEnvelopeSchema,
    autoPersist: false,
    partialize: (s) => ({
      widgets: s.widgets,
      layout: s.layout,
    }),
    merge: (_cur, incoming) => {
      console.log(incoming);
      return incoming
    }
  })((setState) => ({
    widgets: DEFAULT_INSTANCES,
    layout: DEFAULT_INSTANCES.map(v => v.layout),
    setWidgets: (widgets: WidgetInstance[]) => {
      setState({ widgets: widgets });
      setState({ layout: widgets.map(v => v.layout) });
    },
  }))
)
