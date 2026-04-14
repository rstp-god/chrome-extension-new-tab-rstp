import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Separator } from '@/components/ui/separator.tsx'
import { CardOpacitySlider } from '@/newtab/components/Settings/CardOpacitySlider.tsx'
import { ColorSchemeSelector } from '@/newtab/components/Settings/ColorSchemeSelector.tsx'
import { FontSelector } from '@/newtab/components/Settings/FontSelector.tsx'
import { GridLayoutSelector } from '@/newtab/components/Settings/GridLayoutSelector.tsx'
import { RadiusSelector } from '@/newtab/components/Settings/RadiusSelector.tsx'
import { useAppearanceStore } from '@/store/appearance.ts'
import { TestId } from '@tests/constants/testIds.ts'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

export function AppearanceSection() {
  const { t } = useTranslation('settingsDialog')
  const resetToDefaults = useAppearanceStore((s) => s.resetToDefaults)

  const handleReset = () => {
    if (typeof window !== 'undefined' && !window.confirm(t('resetConfirm'))) return
    resetToDefaults()
  }

  return (
    <Accordion type="single" collapsible data-testid={TestId.AppearanceSection}>
      <AccordionItem value="appearance">
        <AccordionTrigger>{t('appearance')}</AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-col gap-5">
            <Block title={t('colorScheme')}>
              <ColorSchemeSelector />
            </Block>

            <Separator />

            <Block title={t('cornerStyle')}>
              <RadiusSelector />
            </Block>

            <Separator />

            <Block title={t('cardOpacity')}>
              <CardOpacitySlider />
            </Block>

            <Separator />

            <Block title={t('font')}>
              <FontSelector />
            </Block>

            <Separator />

            <Block title={t('gridLayout')}>
              <GridLayoutSelector />
            </Block>

            <Separator />

            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              data-testid={TestId.AppearanceReset}
              className="self-end text-muted-foreground"
            >
              {t('resetDefaults')}
            </Button>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm font-medium">{title}</div>
      {children}
    </div>
  )
}
