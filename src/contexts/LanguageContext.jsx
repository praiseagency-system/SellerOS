/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { TRANSLATIONS } from '../i18n'

const LangCtx = createContext(null)
const STORAGE_KEY = 'sq_lang'

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || 'id' } catch { return 'id' }
  })

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, lang) } catch { /* ignore */ }
    document.documentElement.lang = lang
  }, [lang])

  // t(key) → terjemahan untuk bahasa aktif, fallback ke ID lalu ke key mentah.
  const t = useCallback(
    (key) => TRANSLATIONS[lang]?.[key] ?? TRANSLATIONS.id?.[key] ?? key,
    [lang]
  )

  return (
    <LangCtx.Provider value={{ lang, setLang, t }}>
      {children}
    </LangCtx.Provider>
  )
}

export function useLang() {
  const ctx = useContext(LangCtx)
  if (!ctx) throw new Error('useLang must be used within LanguageProvider')
  return ctx
}
