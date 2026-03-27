import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import enBackgroundDialog from '@/i18n/resources/en/backgroundDialog.json'
import enCommon from '@/i18n/resources/en/common.json'
import enErrors from '@/i18n/resources/en/errors.json'
import enHeader from '@/i18n/resources/en/header.json'
import enSearchWidget from '@/i18n/resources/en/widgets/searchWidget.json'
import enSettingsDialog from '@/i18n/resources/en/settingsDialog.json'
import ruBackgroundDialog from '@/i18n/resources/ru/backgroundDialog.json'
import ruCommon from '@/i18n/resources/ru/common.json'
import ruErrors from '@/i18n/resources/ru/errors.json'
import ruHeader from '@/i18n/resources/ru/header.json'
import ruSearchWidget from '@/i18n/resources/ru/widgets/searchWidget.json'
import ruSettingsDialog from '@/i18n/resources/ru/settingsDialog.json'

const resources = {
  ru: {
    common: ruCommon,
    header: ruHeader,
    settingsDialog: ruSettingsDialog,
    backgroundDialog: ruBackgroundDialog,
    searchWidget: ruSearchWidget,
    errors: ruErrors,
  },
  en: {
    common: enCommon,
    header: enHeader,
    settingsDialog: enSettingsDialog,
    backgroundDialog: enBackgroundDialog,
    searchWidget: enSearchWidget,
    errors: enErrors,
  },
} as const

i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  defaultNS: 'common',
  ns: ['common', 'header', 'settingsDialog', 'backgroundDialog', 'searchWidget', 'errors'],
  interpolation: {
    escapeValue: false,
  },
})

export default i18n
