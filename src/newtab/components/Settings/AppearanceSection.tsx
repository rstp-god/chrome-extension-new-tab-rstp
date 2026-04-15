import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Block } from '@/components/compiled/Block.tsx'
import { Separator } from '@/components/ui/separator.tsx'
import { CardOpacitySlider } from '@/newtab/components/Settings/CardOpacitySlider.tsx'
import { ColorSchemeSelector } from '@/newtab/components/Settings/ColorSchemeSelector.tsx'
import { FontSelector } from '@/newtab/components/Settings/FontSelector.tsx'
import { GridLayoutSelector } from '@/newtab/components/Settings/GridLayoutSelector.tsx'
import { RadiusSelector } from '@/newtab/components/Settings/RadiusSelector.tsx'
import { useAppearanceStore } from '@/store/appearance.ts'
import { TestId } from '@tests/constants/testIds.ts'
import type { ComponentType } from 'react'
import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'

const BLOCKS: { key: string; titleKey: string; Component: ComponentType }[] = [
  { key: 'color', titleKey: 'colorScheme', Component: ColorSchemeSelector },
  { key: 'radius', titleKey: 'cornerStyle', Component: RadiusSelector },
  { key: 'opacity', titleKey: 'cardOpacity', Component: CardOpacitySlider },
  { key: 'font', titleKey: 'font', Component: FontSelector },
  { key: 'grid', titleKey: 'gridLayout', Component: GridLayoutSelector },
]

export function AppearanceSection() {
  const { t } = useTranslation('settingsDialog')
  const { resetToDefaults } = useAppearanceStore((s) => s)

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
            {BLOCKS.map(({ key, titleKey, Component }) => (
              <Fragment key={key}>
                <Block title={t(titleKey)}>
                  <Component />
                </Block>
                <Separator />
              </Fragment>
            ))}

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
