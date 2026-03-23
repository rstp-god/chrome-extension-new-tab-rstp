import { WidgetInstance } from '@/types/widgets.ts';

export const DEFAULT_INSTANCES: WidgetInstance[] = [
  {
    id: "search-1",
    title: "Поиск",
    widgetType: 'search',
    layout: { i: "search-1", x: 0, y: 0, w: 3, h: 4, minW: 3, minH: 4, maxH: 4 },
  },
];
