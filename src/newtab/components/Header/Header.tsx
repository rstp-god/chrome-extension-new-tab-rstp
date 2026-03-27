import { Button } from '@/components/ui/button.tsx';
import AddWidgetDialog from '@/newtab/components/Header/AddWidgetDialog.tsx';
import { getGreetingPeriod } from '@/newtab/components/Header/utils/getGreetings.ts';
import { useHeaderStore } from '@/store/header.ts';
import { useWidgetStore } from '@/store/widget.ts';
import { BackgroundStateV1 } from '@/types/background.ts';
import { PinIcon, PinOffIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SettingsDialog } from './SettingsDialog';

interface Props {
  bgState: BackgroundStateV1;
  onSaveBackground: (next: BackgroundStateV1) => Promise<void> | void;
}

export function Header(props: Props) {
  const { t } = useTranslation('header');
  const { t: common } = useTranslation('common');

  const { displayName, pinned, togglePinned } = useHeaderStore(s => s);
  const { commit } = useWidgetStore(s => s);

  const greeting = t(`greetings.${getGreetingPeriod()}`);
  const greetingLine = t('greetingLine', {
    greeting,
    name: displayName ?? common('guest'),
  });

  return (
    <div className="flex items-center justify-between">
      <div className="text-lg font-semibold tracking-tight">{greetingLine}</div>

      <div className="flex items-center gap-2">
        <Button
          variant='ghost'
          onClick={() => {
            commit();
            togglePinned();
          }}
        >
          { pinned ? (<PinIcon/>) : (<PinOffIcon/>)}
        </Button>
        {!pinned && (<AddWidgetDialog/>) }
        <SettingsDialog {...props}/>
      </div>
    </div>
  );
}
