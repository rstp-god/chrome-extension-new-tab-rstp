import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import enBackgroundDialog from '@/i18n/resources/en/backgroundDialog.json'
import enCommon from '@/i18n/resources/en/common.json'
import enErrors from '@/i18n/resources/en/errors.json'
import enHeader from '@/i18n/resources/en/header.json'
import enChromeLibraryWidget from '@/i18n/resources/en/widgets/chromeLibraryWidget.json'
import enProductivityWidget from '@/i18n/resources/en/widgets/productivityWidget.json'
import enScreenTimeWidget from '@/i18n/resources/en/widgets/screenTimeWidget.json'
import enSearchWidget from '@/i18n/resources/en/widgets/searchWidget.json'
import enTabRules from '@/i18n/resources/en/widgets/tabRules.json'
import enTodoWidget from '@/i18n/resources/en/widgets/todoWidget.json'
import enSettingsDialog from '@/i18n/resources/en/settingsDialog.json'
import ruBackgroundDialog from '@/i18n/resources/ru/backgroundDialog.json'
import ruCommon from '@/i18n/resources/ru/common.json'
import ruErrors from '@/i18n/resources/ru/errors.json'
import ruHeader from '@/i18n/resources/ru/header.json'
import ruChromeLibraryWidget from '@/i18n/resources/ru/widgets/chromeLibraryWidget.json'
import ruProductivityWidget from '@/i18n/resources/ru/widgets/productivityWidget.json'
import ruScreenTimeWidget from '@/i18n/resources/ru/widgets/screenTimeWidget.json'
import ruSearchWidget from '@/i18n/resources/ru/widgets/searchWidget.json'
import ruTabRules from '@/i18n/resources/ru/widgets/tabRules.json'
import ruTodoWidget from '@/i18n/resources/ru/widgets/todoWidget.json'
import ruSettingsDialog from '@/i18n/resources/ru/settingsDialog.json'

const resources = {
  ru: {
    common: ruCommon,
    header: ruHeader,
    settingsDialog: ruSettingsDialog,
    backgroundDialog: ruBackgroundDialog,
    chromeLibraryWidget: ruChromeLibraryWidget,
    productivityWidget: ruProductivityWidget,
    screenTimeWidget: ruScreenTimeWidget,
    searchWidget: ruSearchWidget,
    tabRules: ruTabRules,
    todoWidget: ruTodoWidget,
    errors: ruErrors,
  },
  en: {
    common: enCommon,
    header: enHeader,
    settingsDialog: enSettingsDialog,
    backgroundDialog: enBackgroundDialog,
    chromeLibraryWidget: enChromeLibraryWidget,
    productivityWidget: enProductivityWidget,
    screenTimeWidget: enScreenTimeWidget,
    searchWidget: enSearchWidget,
    tabRules: enTabRules,
    todoWidget: enTodoWidget,
    errors: enErrors,
  },
} as const

i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  defaultNS: 'common',
  ns: [
    'common',
    'header',
    'settingsDialog',
    'backgroundDialog',
    'chromeLibraryWidget',
    'productivityWidget',
    'screenTimeWidget',
    'searchWidget',
    'tabRules',
    'todoWidget',
    'errors',
  ],
  interpolation: {
    escapeValue: false,
  },
})

export default i18n
