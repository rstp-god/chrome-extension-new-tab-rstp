import { WidgetFrame } from '@/newtab/components/WidgetLayout/WidgetFrame.tsx';
import { WidgetInstance, widgetRegistry } from '@/types/widgets.ts';

interface Props extends WidgetInstance {
  pinned: boolean;
  onRemove?: () => void;
}


const RenderWidget = ({ widgetType, pinned, title, onRemove, layout }: Props) => {
  const mod = widgetRegistry[widgetType];
  if (!mod) return null;
  const Comp = mod.Component;

  return (
    <div key={layout.i}>
      <WidgetFrame title={title} pinned={pinned} onRemove={onRemove}>
        <Comp />
      </WidgetFrame>
    </div>
  )
};

export default RenderWidget;
