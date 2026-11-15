/** Settings' categories that are open: Accounts and banks at first, then whatever this browser last had (settings/index.vue keeps it). */
export const SETTINGS_OPEN_FIRST = ['accounts']

export const useSettingsOpen = () => useState<string[]>('settings-open', () => [...SETTINGS_OPEN_FIRST])
