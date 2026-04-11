/**
 * Integration descriptors store i18n keys with the `todoWidget:` namespace
 * prefix so they can be passed straight into `i18next.t` from any caller.
 * When a component is already scoped via `useTranslation('todoWidget')`,
 * the prefix has to come off — that's all this helper does.
 */
export function stripNamespace(key: string): string {
  const idx = key.indexOf(':')
  return idx === -1 ? key : key.slice(idx + 1)
}
