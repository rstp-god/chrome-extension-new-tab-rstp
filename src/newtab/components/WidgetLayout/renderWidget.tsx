import { WidgetFrame } from '@/newtab/components/WidgetLayout/WidgetFrame.tsx';
import { WidgetInstance } from '@/types/widgets.ts';
import { SearchWidget } from '@/widgets/Search/SearchWidget.tsx';

interface Props extends WidgetInstance {
  pinned: boolean;
  onRemove?: () => void;
}


const RenderWidget = ({ widgetType, pinned, title, onRemove, layout }: Props) => {
  switch (widgetType) {
    case "search":
      return (
        <div key={layout.i}>
          <WidgetFrame title={title} pinned={pinned} onRemove={onRemove}>
            <SearchWidget/>
          </WidgetFrame>
        </div>
      )
    default:
      return null;
  }
};

export default RenderWidget;
