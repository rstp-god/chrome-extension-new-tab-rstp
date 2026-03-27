import { WidgetMeta } from '@/types/widgets.ts';
import { SearchWidget } from './SearchWidget.tsx';

export const meta = {
  widgetType: "search",
  title: "Search",
  titleI18nKey: 'searchWidget:title',
  description: "Google search",
  descriptionI18nKey: 'searchWidget:description',
  defaultLayout: { w: 2, h: 4, minW: 2, minH: 4 },
} satisfies WidgetMeta;

export const Component = SearchWidget;
