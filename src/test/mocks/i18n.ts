export function createI18nModuleMock() {
  return {
    useTranslation: () => ({
      t: (key: string) => key,
    }),
  }
}
