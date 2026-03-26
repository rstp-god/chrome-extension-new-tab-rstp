import { Button } from '@/components/ui/button.tsx';
import { getGreeting } from '@/newtab/components/Header/utils/getGreetings.ts';
import { useHeaderStore } from '@/store/header.ts';
import { useWidgetStore } from '@/store/widget.ts';
import { BackgroundStateV1 } from '@/types/background.ts';
import { PinIcon, PinOffIcon } from 'lucide-react';
import { SettingsDialog } from "./SettingsDialog";

interface Props {
  bgState: BackgroundStateV1;
  onSaveBackground: (next: BackgroundStateV1) => Promise<void> | void;
}

export function Header(props: Props) {
  const { displayName, pinned, togglePinned } = useHeaderStore(s => s);
  const { commit } = useWidgetStore(s => s);
  return (
    <div className="flex items-center justify-between">
      <div className="text-lg font-semibold tracking-tight">
        {getGreeting()} уважаемый, {displayName}
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant='ghost'
          onClick={() => {
            commit()
            togglePinned();
          }}
        >
          { pinned ? (<PinIcon/>): (<PinOffIcon/>)}
        </Button>
        <SettingsDialog {...props}/>
      </div>
    </div>
  );
}
