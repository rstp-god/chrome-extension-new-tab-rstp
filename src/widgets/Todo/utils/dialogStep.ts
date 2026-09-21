/**
 * Settings dialog step machine. The step is computed from the persisted
 * integration slice plus a transient `intent` (what the user is trying to
 * do right now). See `TodoSettingsDialog.tsx` for how it's wired in.
 */
export type DialogStep = 'picker' | 'connect' | 'board' | 'mapping' | 'summary'

type Translator = (key: string) => string

/**
 * Every step but `picker` belongs to exactly one integration, and each one
 * names its own things differently — Trello picks a *board*, Vikunja picks a
 * *project* and maps *buckets*. So the keys are scoped by the integration's
 * machine name rather than hardcoded.
 *
 * `integrationName` is `null` only on the picker step (nothing is chosen
 * yet). Should a later step somehow be reached without a name, the picker
 * wording is the honest fallback — better than interpolating `null` into a
 * key and rendering it raw.
 */
function integrationKey(
  integrationName: string | null,
  step: DialogStep,
  leaf: 'title' | 'description',
): string {
  if (integrationName === null) return `integrations.picker.${leaf}`
  return `integrations.${integrationName}.${step}.${leaf}`
}

/**
 * i18n key for the dialog title at each step. Kept here so adding a new step
 * is a one-line edit and the dialog component stays presentational.
 */
export function getDialogTitleKey(step: DialogStep, integrationName: string | null): string {
  if (step === 'picker') return 'integrations.picker.title'
  return integrationKey(integrationName, step, 'title')
}

export function getDialogDescriptionKey(step: DialogStep, integrationName: string | null): string {
  if (step === 'picker') return 'integrations.picker.description'
  // The summary step describes the widget's settings, not the backend's, so
  // it keeps the shared wording every integration can use unchanged.
  if (step === 'summary') return 'settings.description'
  return integrationKey(integrationName, step, 'description')
}

export function getDialogTitle(
  step: DialogStep,
  t: Translator,
  integrationName: string | null,
): string {
  return t(getDialogTitleKey(step, integrationName))
}

export function getDialogDescription(
  step: DialogStep,
  t: Translator,
  integrationName: string | null,
): string {
  return t(getDialogDescriptionKey(step, integrationName))
}
