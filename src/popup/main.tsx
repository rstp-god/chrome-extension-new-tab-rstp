import '@/i18n'

import i18n from '@/i18n'
import { getLocal } from '@/services/chrome/storage.ts'
import { HEADER_SETTINGS_KEY } from '@/types/header.ts'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App.tsx'
import '@/styles/popup.css'

document.documentElement.classList.add('dark')

getLocal<{ state?: { language?: string } }>(HEADER_SETTINGS_KEY).then((envelope) => {
  const lang = envelope?.state?.language
  if (lang && lang !== i18n.language) {
    i18n.changeLanguage(lang)
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
