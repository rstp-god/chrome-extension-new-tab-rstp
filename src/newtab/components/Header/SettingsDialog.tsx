import { Button } from '@/components/ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Label } from '@/components/ui/label.tsx';
import { Switch } from '@/components/ui/switch.tsx';
import { BackgroundDialog } from '@/newtab/components/Background/BackgroundDialog.tsx';
import { useHeaderStore } from '@/store/header.ts';
import { BackgroundStateV1 } from '@/types/background.ts';
import { useState } from 'react';

interface Props {
  bgState: BackgroundStateV1;
  onSaveBackground: (next: BackgroundStateV1) => Promise<void> | void;
}

export function SettingsDialog({ bgState, onSaveBackground}: Props) {
  const [ open, setOpen ] = useState(false);
  const [ bgOpen, setBgOpen ] = useState(false);
  const { displayName, theme, setDisplayName, toggleTheme} = useHeaderStore(s => s);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Настройки</Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Настройки</DialogTitle>
          <DialogDescription>Тема, имя и фон.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-6">
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-border p-4">
            <div className="grid gap-1">
              <div className="text-sm font-medium">Тема</div>
              <div className="text-xs text-muted-foreground">
                Switch = dark / light
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Light</Label>
              <Switch checked={theme === "dark"} onCheckedChange={toggleTheme}/>
              <Label className="text-xs text-muted-foreground">Dark</Label>
            </div>
          </div>

          <div className="grid gap-2">
            <div className="text-sm font-medium">Имя</div>
            <div className="text-xs text-muted-foreground">
              Если пусто — будет “Гость”.
            </div>

            <Input
              value={displayName ?? ""}
              placeholder="Например: Роман"
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          <Button variant="outline" onClick={() => setBgOpen(true)}>
            Сменить фон
          </Button>

          <BackgroundDialog
            open={bgOpen}
            onOpenChange={setBgOpen}
            value={bgState}
            onSaved={onSaveBackground}
          />
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Закрыть
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
