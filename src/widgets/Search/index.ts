import { WidgetMeta } from '@/types/widgets.ts';
import { SearchWidget } from './SearchWidget.tsx';

export const meta = {
  widgetType: "search",
  title: "Поиск",
  description: "Google поиск",
  defaultLayout: { w: 2, h: 4, minW: 2, minH: 4 },
} satisfies WidgetMeta;

export const Component = SearchWidget;
