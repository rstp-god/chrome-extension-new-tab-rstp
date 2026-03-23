import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx';
import { ReactNode } from 'react';

interface Props {
  title: string;
  children: ReactNode;
  pinned: boolean;
}

export function WidgetFrame({ title, children, pinned }: Props) {
  return (
    <Card className="h-full handle">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm">{title}</CardTitle>
        {pinned && (<div className="cursor-grab select-none text-xs text-muted-foreground">drag</div>)}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
