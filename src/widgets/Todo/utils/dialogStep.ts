/**
 * Settings dialog step machine. The step is computed from the persisted
 * integration slice plus a transient `intent` (what the user is trying to
 * do right now). See `TodoSettingsDialog.tsx` for how it's wired in.
 */
export type DialogStep = 'picker' | 'connect' | 'board' | 'mapping' | 'summary'

type Translator = (key: string) => string

/**
 * Fallback for the connect step when no integration is picked yet. That
 * combination is unreachable through the dialog (the step exists only once a
 * name is chosen), so the default merely keeps the old single-integration
 * behaviour for any caller that omits the argument.
 */
const DEFAULT_INTEGRATION_NAME = 'trello'

/**
 * i18n key for the dialog title at each step. Kept here so adding a new step
 * is a one-line edit and the dialog component stays presentational.
 *
 * Only the connect step varies by integration: the later steps keep the
 * Trello keys until tasks 5–7 give Vikunja its own scope/mapping wording.
 */
export function getDialogTitleKey(step: DialogStep, integrationName?: string | null): string {
  switch (step) {
    case 'picker':
      return 'integrations.picker.title'
    case 'connect':
      return `integrations.${integrationName ?? DEFAULT_INTEGRATION_NAME}.connect.title`
    case 'board':
      return 'integrations.trello.board.title'
    case 'mapping':
      return 'integrations.trello.mapping.title'
    case 'summary':
      return 'integrations.trello.summary.title'
  }
}

export function getDialogDescriptionKey(step: DialogStep, integrationName?: string | null): string {
  switch (step) {
    case 'picker':
      return 'integrations.picker.description'
    case 'connect':
      return `integrations.${integrationName ?? DEFAULT_INTEGRATION_NAME}.connect.description`
    case 'board':
      return 'integrations.trello.board.description'
    case 'mapping':
      return 'integrations.trello.mapping.description'
    case 'summary':
      return 'settings.description'
  }
}

export function getDialogTitle(
  step: DialogStep,
  t: Translator,
  integrationName?: string | null,
): string {
  return t(getDialogTitleKey(step, integrationName))
}

export function getDialogDescription(
  step: DialogStep,
  t: Translator,
  integrationName?: string | null,
): string {
  return t(getDialogDescriptionKey(step, integrationName))
}
