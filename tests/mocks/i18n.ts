export function createI18nModuleMock() {
  return {
    useTranslation: () => ({
      t: (key: string) => key,
      i18n: {
        t: (key: string) => key,
        changeLanguage: async () => {},
      },
    }),
  }
}
