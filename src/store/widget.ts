import { ChromeSyncActions, withChromeSync } from '@/services/chrome/zustandChromeSync.ts'
import { layoutItemSchema } from '@/services/zod/zodCommon.ts'
import { makeEnvelopeSchema } from '@/services/zod/zodEnvelop.ts'
import {
  DEFAULT_INSTANCES,
  WIDGET_LAYOUT_KEY,
  WidgetInstance,
  widgetRegistry,
  Widgets,
  WidgetType,
} from '@/types/widgets.ts'
import { createWidgetInstance } from '@/utils/widgets.ts'
import { z } from 'zod'
import { create } from 'zustand/react'

interface WidgetStore extends Widgets {
  setWidgets: (widgets: WidgetInstance[]) => void
  addWidget: (data: WidgetType) => void
}

const widgetInstanceShema = z.object({
  id: z.string(),
  title: z.string(),
  layout: layoutItemSchema,
  widgetType: z.enum(Object.keys(widgetRegistry) as [string, ...string[]]),
})
const widgetStoreSchema = z.object({
  widgets: z.array(widgetInstanceShema),
  layout: z.array(layoutItemSchema),
})
const widgetEnvelopeSchema = makeEnvelopeSchema(widgetStoreSchema)

export const useWidgetStore = create<WidgetStore & ChromeSyncActions>()(
  withChromeSync<WidgetStore, Widgets>({
    key: WIDGET_LAYOUT_KEY,
    area: 'sync',
    schema: widgetEnvelopeSchema,
    autoPersist: false,
    partialize: (s) => ({
      widgets: s.widgets,
      layout: s.layout,
    }),
    merge: (_cur, incoming) => {
      return incoming
    },
  })((setState) => ({
    widgets: DEFAULT_INSTANCES,
    layout: DEFAULT_INSTANCES.map((v) => v.layout),
    setWidgets: (widgets: WidgetInstance[]) => {
      setState({ widgets: widgets, layout: widgets.map((v) => v.layout) })
    },
    addWidget: (widgetType) => {
      setState((s) => {
        const newWidget: WidgetInstance = createWidgetInstance(widgetType, s.layout)

        return {
          widgets: [...s.widgets, newWidget],
          layout: [...s.layout, newWidget.layout],
        }
      })
    },
  })),
)
