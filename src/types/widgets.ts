import { LayoutItem } from 'react-grid-layout';

export type WidgetType = 'search';

export type WidgetInstance = {
  id: string;
  title: string;
  layout: LayoutItem;
  widgetType: WidgetType;
};
