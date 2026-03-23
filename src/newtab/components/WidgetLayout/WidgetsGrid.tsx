import { useHeaderState } from '@/newtab/components/Header/hooks/useHeaderState.ts';
import { useWidgetLoad } from '@/newtab/components/WidgetLayout/hooks/useWidgetLoad.ts';
import renderWidget from '@/newtab/components/WidgetLayout/renderWidget.tsx';
import { WidgetInstance } from '@/types/widgets.ts';
import ReactGridLayout, { Layout, noCompactor, useContainerWidth } from 'react-grid-layout';

export function WidgetsGrid() {
  const { containerRef, width, mounted } = useContainerWidth();
  const { settings: { pinned } } = useHeaderState();
  const { layout, persist } = useWidgetLoad();

  const onLayoutChange = (next: Layout) => {
    if (pinned) return;
    const result = layout.map((v): WidgetInstance | null => {
      const currLayout = next.find(newLayout => v.layout.i === newLayout.i);
      if (currLayout) {
        return {
          ...v,
          layout: {
            ...currLayout
          }
        }
      }
      return null;
    }).filter(v => v !== null);
    persist(result)
  };

  return (
    <div ref={containerRef}>
      {mounted && (
        <ReactGridLayout
          width={width}
          layout={layout.map((w) => w.layout)}
          gridConfig={{ cols: 12, rowHeight: 30, margin: [ 12, 12 ], containerPadding: [ 0, 0 ] }}
          dragConfig={{ enabled: !pinned, handle: '.handle' }}
          resizeConfig={{ enabled: !pinned }}
          onLayoutChange={onLayoutChange}
          compactor={noCompactor}
        >
          {layout.map((w) => renderWidget({ ...w, pinned: !pinned }))}
        </ReactGridLayout>
      )}
    </div>
  );
}
