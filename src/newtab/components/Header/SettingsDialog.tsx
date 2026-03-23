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
import { BackgroundStateV1 } from '@/types/background.ts';
import { HeaderSettingsV1, ThemeMode } from '@/types/header.ts';
import { useEffect, useState } from 'react';

interface Props {
  value: HeaderSettingsV1;
  onSave: (next: HeaderSettingsV1) => Promise<void> | void;
  bgState: BackgroundStateV1;
  onSaveBackground: (next: BackgroundStateV1) => Promise<void> | void;
}

export function SettingsDialog({ value, onSave, bgState, onSaveBackground}: Props) {
  const [ open, setOpen ] = useState(false);
  const [ bgOpen, setBgOpen ] = useState(false);
  const [ draft, setDraft ] = useState<HeaderSettingsV1>(value);

  useEffect(() => {
    if (open) setDraft(value);
  }, [ open, value ]);

  const onChangeTheme = (checked: boolean) => {
    const theme: ThemeMode = checked ? "dark" : "light";
    setDraft((p) => ({ ...p, theme }));
  };

  const onChangeName = (v: string) => {
    const s = v.trim();
    setDraft((p) => ({ ...p, displayName: s ? v : null }));
  };

  const onSubmit = async () => {
    await onSave(draft);
    setOpen(false);
  };

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
              <Switch checked={draft.theme === "dark"} onCheckedChange={onChangeTheme}/>
              <Label className="text-xs text-muted-foreground">Dark</Label>
            </div>
          </div>

          <div className="grid gap-2">
            <div className="text-sm font-medium">Имя</div>
            <div className="text-xs text-muted-foreground">
              Если пусто — будет “Гость”.
            </div>

            <Input
              value={draft.displayName ?? ""}
              placeholder="Например: Роман"
              onChange={(e) => onChangeName(e.target.value)}
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
          <Button onClick={onSubmit}>Сохранить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
