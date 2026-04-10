import { todoIntegrationRegistry } from '@/widgets/Todo/integrations/index.ts'
import { ChevronRightIcon, PlugIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface Props {
  onPick: (integrationName: string) => void
}

/**
 * Step 0 of the settings flow: list every integration registered under
 * `src/widgets/Todo/integrations/<name>/`. Adding a new integration here is
 * zero-config — drop a folder, register a `descriptor`, and it shows up.
 */
export function TodoSettingsPicker({ onPick }: Props) {
  const { t } = useTranslation('todoWidget')
  const descriptors = Object.values(todoIntegrationRegistry)

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">{t('integrations.picker.description')}</p>

      {descriptors.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
          {t('integrations.picker.empty')}
        </div>
      ) : (
        <div className="grid gap-2">
          {descriptors.map((descriptor) => (
            <button
              key={descriptor.name}
              type="button"
              onClick={() => onPick(descriptor.name)}
              className="group flex items-center gap-3 rounded-2xl border border-border bg-muted/30 px-4 py-3 text-left transition hover:border-primary hover:bg-muted/50"
            >
              <span className="flex size-9 items-center justify-center rounded-xl bg-background/60 text-muted-foreground group-hover:text-foreground">
                <PlugIcon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">
                  {t(stripNamespace(descriptor.titleI18nKey))}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {t(stripNamespace(descriptor.descriptionI18nKey))}
                </span>
              </span>
              <ChevronRightIcon className="size-4 text-muted-foreground group-hover:text-foreground" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Descriptors store i18n keys with the `todoWidget:` namespace prefix so they
 * can be passed straight into `i18next.t` from any caller. Inside this
 * component we already scoped `useTranslation('todoWidget')`, so the prefix
 * has to come off.
 */
function stripNamespace(key: string): string {
  const idx = key.indexOf(':')
  return idx === -1 ? key : key.slice(idx + 1)
}
