import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json'

export default defineManifest({
  manifest_version: 3,
  name: pkg.name,
  version: pkg.version,
  icons: {
    16: 'public/logo-16.png',
    32: 'public/logo-32.png',
    48: 'public/logo-48.png',
    128: 'public/logo.png',
  },
  action: {
    default_icon: {
      16: 'public/logo-16.png',
      32: 'public/logo-32.png',
      48: 'public/logo-48.png',
      128: 'public/logo.png',
    },
    default_popup: 'src/popup/index.html',
  },
  chrome_url_overrides: {
    newtab: 'src/newtab/index.html',
  },
  permissions: [
    'contentSettings',
    'storage',
    'tabs',
    'bookmarks',
    'tabGroups',
    'alarms',
    'notifications',
    'idle',
  ],
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module' as const,
  },
  host_permissions: ['https://api.trello.com/*'],
})
