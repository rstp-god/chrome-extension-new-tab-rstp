import { Button } from '@/components/ui/button.tsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog.tsx';
import { useWidgetStore } from '@/store/widget.ts';
import { widgetRegistry } from '@/types/widgets.ts';
import { useState } from 'react';

function AddWidgetDialog() {
  const [ open, setOpen ] = useState(false);
  const { addWidget } = useWidgetStore(s => s);

  console.log(widgetRegistry);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant='outline'>
          Добавить виджет
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Добавление виджета</DialogTitle>
        </DialogHeader>
        <div>
          {Object.values(widgetRegistry).map((widget) => {
            return (
              <div>
                {widget.meta.title}
                <Button variant='secondary' onClick={() => addWidget(widget.meta.widgetType)}>
                  Добавить
                </Button>
              </div>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default AddWidgetDialog;
