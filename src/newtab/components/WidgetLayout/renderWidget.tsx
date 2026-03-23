import { WidgetFrame } from '@/newtab/components/WidgetLayout/WidgetFrame.tsx';
import { WidgetInstance } from '@/types/widgets.ts';
import { SearchWidget } from '@/widgets/Search/SearchWidget.tsx';

interface Props extends WidgetInstance {
  pinned: boolean;
}


const RenderWidget = (props: Props) => {
  switch (props.widgetType) {
    case "search":
      return (
        <div key={props.layout.i}>
          <WidgetFrame title={props.title} pinned={props.pinned}>
            <SearchWidget />
          </WidgetFrame>
        </div>
      )
    default:
      return null;
  }
};

export default RenderWidget;
