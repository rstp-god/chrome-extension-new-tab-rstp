import { RenderWidget } from '@/newtab/components/WidgetLayout/RenderWidget.tsx'
import { useAppearanceStore } from '@/store/appearance.ts'
import { useHeaderStore } from '@/store/header.ts'
import { useWidgetStore } from '@/store/widget.ts'
import { WidgetInstance } from '@/types/widgets.ts'
import ReactGridLayout, { Layout, noCompactor, useContainerWidth } from 'react-grid-layout'

export function WidgetsGrid() {
  const { containerRef, width, mounted } = useContainerWidth()
  const { pinned } = useHeaderStore()
  const { widgets, setWidgets, layout } = useWidgetStore()
  const grid = useAppearanceStore((s) => s.grid)

  const onLayoutChange = (next: Layout) => {
    if (pinned) return
    const result = widgets
      .map((v): WidgetInstance | null => {
        const currLayout = next.find((newLayout) => v.layout.i === newLayout.i)
        if (currLayout) {
          return {
            ...v,
            layout: {
              ...currLayout,
            },
          }
        }
        return null
      })
      .filter((v) => v !== null)
    setWidgets(result)
  }

  return (
    <div ref={containerRef}>
      {mounted && (
        <ReactGridLayout
          width={width}
          layout={layout}
          gridConfig={{
            cols: grid.columns,
            rowHeight: grid.rowHeight,
            margin: [grid.gap, grid.gap],
            containerPadding: [0, 0],
          }}
          dragConfig={{ enabled: !pinned, handle: '.handle' }}
          resizeConfig={{ enabled: !pinned }}
          onLayoutChange={onLayoutChange}
          compactor={noCompactor}
        >
          {widgets.map((w) => (
            <div key={w.layout.i}>
              <RenderWidget
                {...w}
                pinned={!pinned}
                onRemove={() => {
                  onLayoutChange(widgets.filter((v) => v.id !== w.id).map((l) => l.layout))
                }}
              />
            </div>
          ))}
        </ReactGridLayout>
      )}
    </div>
  )
}
