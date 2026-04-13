import { useHeaderStore } from '@/store/header.ts'
import { ActionBar } from '@/popup/components/ActionBar.tsx'
import { CleanupSection } from '@/popup/components/CleanupSection.tsx'
import { PopupHeader } from '@/popup/components/PopupHeader.tsx'
import { RulesList } from '@/popup/components/RulesList.tsx'
import { SettingsSection } from '@/popup/components/SettingsSection.tsx'
import { SortingSection } from '@/popup/components/SortingSection.tsx'
import { useTabRulesStore } from '@/popup/store/tabRules.ts'

export default function App() {
  const enabled = useTabRulesStore((s) => s.enabled)
  // Sync language from header store (triggers i18n.changeLanguage via withChromeSync merge)
  useHeaderStore((s) => s.language)

  return (
    <div className="flex h-[600px] w-[500px] flex-col bg-background text-foreground">
      <PopupHeader />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={enabled ? 'space-y-2.5 px-3 pb-3' : 'space-y-2.5 px-3 pb-3 opacity-50'}>
          <RulesList />
          <SortingSection />
          <CleanupSection />
          <SettingsSection />
        </div>
      </div>

      <ActionBar />
    </div>
  )
}
