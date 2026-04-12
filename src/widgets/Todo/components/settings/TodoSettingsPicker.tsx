import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item.tsx'
import { todoIntegrationRegistry } from '@/widgets/Todo/integrations/index.ts'
import { stripNamespace } from '@/widgets/Todo/utils/i18n.ts'
import { ChevronRightIcon, PlugIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface Props {
  onPick: (integrationName: string) => void
}

/**
 * Step 0 of the settings flow: list every integration registered under
 * `src/widgets/Todo/integrations/<name>/`. Adding a new integration is
 * zero-config — drop a folder, register a `descriptor`, and it shows up.
 *
 * Each row uses the shadcn `Item` primitive (asChild → button) so picker
 * rows stay consistent with the rest of the project's list affordances.
 */
export function TodoSettingsPicker({ onPick }: Props) {
  const { t } = useTranslation('todoWidget')
  const descriptors = Object.values(todoIntegrationRegistry)

  if (descriptors.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
        {t('integrations.picker.empty')}
      </div>
    )
  }

  return (
    <ItemGroup>
      {descriptors.map((descriptor) => (
        <Item
          key={descriptor.name}
          variant="outline"
          asChild
          className="cursor-pointer hover:border-primary hover:bg-muted/50"
        >
          <button type="button" onClick={() => onPick(descriptor.name)}>
            <ItemMedia variant="icon">
              <PlugIcon />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{t(stripNamespace(descriptor.titleI18nKey))}</ItemTitle>
              <ItemDescription>{t(stripNamespace(descriptor.descriptionI18nKey))}</ItemDescription>
            </ItemContent>
            <ItemActions>
              <ChevronRightIcon className="size-4 text-muted-foreground" />
            </ItemActions>
          </button>
        </Item>
      ))}
    </ItemGroup>
  )
}
