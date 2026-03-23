import { Button } from '@/components/ui/button.tsx';
import { useHeaderState } from '@/newtab/components/Header/hooks/useHeaderState.ts';
import { BackgroundStateV1 } from '@/types/background.ts';
import { PinIcon, PinOffIcon } from 'lucide-react';
import { SettingsDialog } from "./SettingsDialog";

interface Props {
  bgState: BackgroundStateV1;
  onSaveBackground: (next: BackgroundStateV1) => Promise<void> | void;
}

export function Header(props: Props) {
  const { settings, displayName, greeting, persist } = useHeaderState();
  return (
    <div className="flex items-center justify-between">
      <div className="text-lg font-semibold tracking-tight">
        {greeting} уважаемый, {displayName}
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant='ghost'
          onClick={() => persist({ ...settings, pinned: !settings.pinned })}
        >
          { settings.pinned ? (<PinIcon/>): (<PinOffIcon/>)}
        </Button>
        <SettingsDialog {...props} value={settings} onSave={persist}/>
      </div>
    </div>
  );
}
