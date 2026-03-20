import { Button } from '@/components/ui/button.tsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog.tsx';
import { Input } from '@/components/ui/input.tsx';
import { clearBackground, saveBackgroundFromFile } from '@/newtab/components/Background/services/loadImages.ts';
import { BackgroundStateV1 } from '@/types/background.ts';
import { useState } from 'react';

interface Props {
  value: BackgroundStateV1;
  onSaved: (next: BackgroundStateV1) => Promise<void> | void;
}

export function BackgroundDialog({ value, onSaved, }: Props) {
  const [ open, setOpen ] = useState(false);
  const [ file, setFile ] = useState<File | null>(null);
  const [ saving, setSaving ] = useState(false);
  const [ error, setError ] = useState<string | null>(null);

  const onPick = (f: File | null) => {
    setError(null);
    setFile(f);
  };

  const onSave = async () => {
    if (!file) return;

    setSaving(true);
    setError(null);

    try {
      const next = await saveBackgroundFromFile({ file, current: value, maxMb: 12 });
      await onSaved(next);

      setFile(null);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save background");
    } finally {
      setSaving(false);
    }
  };

  const onClear = async () => {
    setSaving(true);
    setError(null);

    try {
      const next = await clearBackground({ current: value });
      await onSaved(next);

      setFile(null);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to clear background");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => (saving ? null : setOpen(v))}
    >
      <DialogTrigger asChild>
        <Button variant="outline">Background</Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Background image</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <div className="text-sm text-muted-foreground">
              Upload a local image. Applied only after Save.
            </div>

            <Input
              type="file"
              accept="image/*"
              onChange={(e) => onPick(e.target.files?.[0] ?? null)}
              disabled={saving}
              className="file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-secondary-foreground"
            />

            {error && <div className="text-sm text-destructive">{error}</div>}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClear} disabled={saving}>
              Clear
            </Button>
            <Button onClick={onSave} disabled={!file || saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
