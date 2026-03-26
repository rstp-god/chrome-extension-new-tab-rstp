import { Layout, LayoutItem } from 'react-grid-layout';

export const WIDGET_LAYOUT_KEY = "widgets-layout:v1";

export type WidgetType = 'search';

export type WidgetInstance = {
  id: string;
  title: string;
  layout: LayoutItem;
  widgetType: WidgetType;
};

export type Widgets = {
  widgets: WidgetInstance[],
  layout: Layout
};

export const DEFAULT_INSTANCES: WidgetInstance[] = [
  {
    id: "search-1",
    title: "Поиск",
    widgetType: 'search',
    layout: { i: "search-1", x: 0, y: 0, w: 3, h: 4, minW: 3, minH: 4, maxH: 4 },
  },
];
