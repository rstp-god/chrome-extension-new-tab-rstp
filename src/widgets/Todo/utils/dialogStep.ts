/**
 * Settings dialog step machine. The step is computed from the persisted
 * integration slice plus a transient `intent` (what the user is trying to
 * do right now). See `TodoSettingsDialog.tsx` for how it's wired in.
 */
export type DialogStep = 'picker' | 'connect' | 'board' | 'mapping' | 'summary'

type Translator = (key: string) => string

/**
 * i18n key for the dialog title at each step. Kept here so adding a new step
 * is a one-line edit and the dialog component stays presentational.
 */
export function getDialogTitleKey(step: DialogStep): string {
  switch (step) {
    case 'picker':
      return 'integrations.picker.title'
    case 'connect':
      return 'integrations.trello.connect.title'
    case 'board':
      return 'integrations.trello.board.title'
    case 'mapping':
      return 'integrations.trello.mapping.title'
    case 'summary':
      return 'integrations.trello.summary.title'
  }
}

export function getDialogDescriptionKey(step: DialogStep): string {
  switch (step) {
    case 'picker':
      return 'integrations.picker.description'
    case 'connect':
      return 'integrations.trello.connect.description'
    case 'board':
      return 'integrations.trello.board.description'
    case 'mapping':
      return 'integrations.trello.mapping.description'
    case 'summary':
      return 'settings.description'
  }
}

export function getDialogTitle(step: DialogStep, t: Translator): string {
  return t(getDialogTitleKey(step))
}

export function getDialogDescription(step: DialogStep, t: Translator): string {
  return t(getDialogDescriptionKey(step))
}
