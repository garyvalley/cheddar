/**
 * How Cheddar looks for one person: a colour theme and light or dark. Both are
 * saved on their account (users.theme, users.appearance), so every device
 * they sign in on looks the same. '' on the record is the default.
 * The colours themselves are in app/assets/css/main.css.
 */
export const THEMES = [
  { value: 'violet', label: 'Violet' },
  { value: 'cheddar', label: 'Cheddar' },
  { value: 'blue', label: 'Blue' },
  { value: 'rose', label: 'Rose' },
  { value: 'mint', label: 'Mint' },
] as const

export const APPEARANCES = [
  { value: 'system', label: 'Automatic' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const

export type Theme = typeof THEMES[number]['value']
export type Appearance = typeof APPEARANCES[number]['value']

export const DEFAULT_THEME: Theme = 'violet'
export const DEFAULT_APPEARANCE: Appearance = 'system'

export const isTheme = (v: unknown): v is Theme => THEMES.some(t => t.value === v)
export const isAppearance = (v: unknown): v is Appearance => APPEARANCES.some(a => a.value === v)
