<script setup lang="ts">
// Settings in categories, each opened and closed on its own heading: the
// accounts and banks every number comes from first, then you, how Cheddar
// looks, sign-in, and your data. A link such as /settings#export opens the
// category it's in (SettingsCategory).
const KEY = 'cheddar:settings-open'
const open = useSettingsOpen()
onMounted(() => {
  // After hydration, so the server's page and the first paint agree. A category a link
  // just opened stays open.
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (Array.isArray(saved) && saved.every(s => typeof s === 'string')) {
      open.value = [...new Set([...saved, ...open.value.filter(id => !SETTINGS_OPEN_FIRST.includes(id))])]
    }
  }
  catch { /* private window or blocked storage: the defaults stand */ }
  watch(open, (ids) => {
    try { localStorage.setItem(KEY, JSON.stringify(ids)) }
    catch { /* not kept, which is fine */ }
  })
})
const all = ['accounts', 'you', 'appearance', 'security', 'data']
const allOpen = computed(() => all.every(id => open.value.includes(id)))
</script>

<template>
  <div>
    <AppHeader title="Settings" sub="Your accounts and banks, you, and how Cheddar works for you.">
      <button class="btn btn-plain" @click="open = allOpen ? [] : [...all]">{{ allOpen ? 'Close all' : 'Open all' }}</button>
    </AppHeader>

    <SettingsCategory id="accounts" title="Accounts and banks" sub="Bank links, every account, and statement imports">
      <BankLinks />
      <SettingsAccounts />
    </SettingsCategory>

    <SettingsCategory id="you" title="Profile and household" sub="Your name, state and filing status, and who you share with">
      <div class="cols">
        <SettingsProfile />
        <SettingsHousehold />
      </div>
    </SettingsCategory>

    <SettingsCategory id="appearance" title="Appearance" sub="Light or dark, and the colour theme">
      <SettingsAppearance />
    </SettingsCategory>

    <SettingsCategory id="security" title="Sign-in and security" sub="Email and password, two-step sign-in, devices, recent activity">
      <div class="cols">
        <div>
          <SettingsAccount part="sign-in" />
          <SettingsTwoStep />
        </div>
        <div>
          <SettingsDevices />
          <SettingsActivity />
        </div>
      </div>
    </SettingsCategory>

    <SettingsCategory id="data" title="Your data" sub="Export everything, or delete your account">
      <div class="cols">
        <SettingsExport />
        <SettingsAccount part="delete" />
      </div>
    </SettingsCategory>
  </div>
</template>

<style scoped>
@media (min-width: 1100px) {
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 0 1.5rem; align-items: start; }
}
</style>
