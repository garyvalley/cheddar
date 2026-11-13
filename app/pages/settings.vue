<template>
  <div>
    <AppHeader title="Settings" />
    <!-- Two columns on a wide screen: you and how Cheddar looks; then sign-in, your data and the account itself. -->
    <div class="cols">
      <div>
        <SettingsProfile />
        <SettingsHousehold />
        <SettingsAppearance />
      </div>
      <div>
        <SettingsTwoStep />
        <SettingsExport />
        <SettingsAccount />
      </div>
    </div>
  </div>
</template>

<style scoped>
@media (min-width: 1100px) {
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 0 1.5rem; align-items: start; }
}
</style>
