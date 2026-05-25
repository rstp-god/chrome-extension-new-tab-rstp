import { Card, CardAction, CardContent, CardHeader } from '@/components/ui/card.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { TestId } from '@tests/constants/testIds.ts'

/** Сетка из четырёх ячеек повторяет финальную раскладку — не «прыгает» при загрузке. */
const SKELETON_METRIC_COUNT = 4

/** Loader-плейсхолдер виджета: вынесен из основного компонента ради читаемости. */
export function ProductivitySkeleton() {
  return (
    <Card className="h-full" data-testid={TestId.ProductivityWidgetSkeleton}>
      <CardHeader>
        <Skeleton className="h-5 w-32" />
        <CardAction>
          <Skeleton className="h-8 w-24" />
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: SKELETON_METRIC_COUNT }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
