import { StarIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button.tsx'

interface Props {
  /** Project title, as `listScopes` reported it (or as the board cached it). */
  name: string
  /** Is this project one the connection syncs? */
  checked: boolean
  /** Is it the one new tasks are created in? */
  isDefault: boolean
  disabled: boolean
  onToggle: (checked: boolean) => void
  onMakeDefault: () => void
}

/**
 * One project in the boards step: a checkbox, its name, and the star that
 * makes it the board new tasks go to.
 *
 * A plain `<input type="checkbox">` rather than a component from
 * `components/ui`: there is no shadcn checkbox in this project, and the two
 * things one would buy (a Radix primitive and a dependency) are not worth it
 * for a list of names — the native control is already the right role, the
 * right keyboard behaviour and the right label association.
 *
 * The star is a button rather than a radio: the row's checkbox already owns
 * the row's main click target, and a radio inside a checked list reads as a
 * second, competing selection. `aria-pressed` says what it is.
 */
export function VikunjaBoardRow({
  name,
  checked,
  isDefault,
  disabled,
  onToggle,
  onMakeDefault,
}: Props) {
  const { t } = useTranslation('todoWidget')
  const boardsKey = (leaf: string) => `integrations.vikunja.boards.${leaf}`

  return (
    <li className="flex items-center gap-3 rounded-2xl px-3 py-2 hover:bg-muted/40">
      <input
        type="checkbox"
        className="size-4 shrink-0 accent-primary"
        checked={checked}
        disabled={disabled}
        aria-label={name}
        onChange={(event) => onToggle(event.target.checked)}
      />

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{name}</div>
        {isDefault && (
          <div className="text-xs text-muted-foreground">{t(boardsKey('defaultHint'))}</div>
        )}
      </div>

      <Button
        type="button"
        size="icon"
        variant="ghost"
        // Starring an unchecked project would name a default the config is
        // about to drop; checking it first is the only order that makes sense.
        disabled={disabled || !checked}
        aria-pressed={isDefault}
        aria-label={t(boardsKey('default'))}
        title={t(boardsKey('default'))}
        onClick={onMakeDefault}
      >
        <StarIcon className={isDefault ? 'fill-current text-amber-400' : 'text-muted-foreground'} />
      </Button>
    </li>
  )
}
