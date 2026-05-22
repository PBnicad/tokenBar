import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

export type Lang = 'zh' | 'en'

type NestedKeyOf<T> = T extends object
  ? { [K in keyof T & string]: T[K] extends object
      ? `${K}.${NestedKeyOf<T[K]>}`
      : K
    }[keyof T & string]
  : never

type TranslationValue = string

// Flatten nested object keys
function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {}
  for (const key of Object.keys(obj)) {
    const value = obj[key]
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') {
      result[fullKey] = value
    } else if (value && typeof value === 'object') {
      Object.assign(result, flatten(value as Record<string, unknown>, fullKey))
    }
  }
  return result
}

// Simple template: replace {key} with values
function tpl(str: string, vars?: Record<string, string | number>): string {
  if (!vars) return str
  return str.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? `{${key}}`))
}

interface I18nContextType {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: string, vars?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextType>({
  lang: 'en',
  setLang: () => {},
  t: (key: string) => key
})

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    try {
      return (localStorage.getItem('opencodebar-lang') as Lang) || 'en'
    } catch {
      return 'en'
    }
  })

  const [flatLocale, setFlatLocale] = useState<Record<string, string>>({})

  const loadLocale = useCallback(async (l: Lang) => {
    try {
      const mod = await import(`./locales/${l}.ts`)
      setFlatLocale(flatten(mod.default))
    } catch {
      setFlatLocale({})
    }
  }, [])

  // Load initial locale
  const initialized = useState(false)
  if (!initialized[0]) {
    loadLocale(lang)
    initialized[0] = true
  }

  const changeLang = useCallback((l: Lang) => {
    setLang(l)
    try {
      localStorage.setItem('opencodebar-lang', l)
    } catch { /* ignore */ }
    loadLocale(l)
  }, [loadLocale])

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>): string => {
      const raw = flatLocale[key] ?? key
      return tpl(raw, vars)
    },
    [flatLocale]
  )

  return (
    <I18nContext.Provider value={{ lang, setLang: changeLang, t }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useT() {
  const ctx = useContext(I18nContext)
  return ctx
}
