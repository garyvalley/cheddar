/** Settings' categories that are open. Every visit starts with all of them closed; a link into one opens it (SettingsCategory). */
export const useSettingsOpen = () => useState<string[]>('settings-open', () => [])
