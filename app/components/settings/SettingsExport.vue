<script setup lang="ts">
const { busy, error, download } = useDataExport()

const asking = ref(false)
const password = ref('')
const done = ref(false)

async function exportNow() {
  done.value = false
  if (!await download(password.value)) return
  asking.value = false
  password.value = ''
  done.value = true
}

function cancel() {
  asking.value = false
  password.value = ''
  error.value = ''
}
</script>

<template>
  <section id="export" class="group" aria-labelledby="export-title">
    <h2 id="export-title" class="group-title">Your data</h2>
    <div class="card">
      <div v-if="!asking" class="row">
        <span class="row-label">
          Export your data
          <span class="footnote block">A zip of your accounts, transactions and balance history as spreadsheets (CSV), and everything, categories and rules too, in one JSON file.</span>
        </span>
        <button class="btn btn-tinted" @click="asking = true; done = false">Export…</button>
      </div>
      <form v-else class="field stack" @submit.prevent="exportNow">
        <label>
          <span class="field-label">Enter your password to export everything</span>
          <input v-model="password" v-focus class="input" type="password" autocomplete="current-password" required>
        </label>
        <div class="btn-row">
          <button class="btn btn-primary" :disabled="busy">
            <span v-if="busy" class="spinner" aria-hidden="true" /> Download
          </button>
          <button type="button" class="btn btn-plain" @click="cancel">Cancel</button>
        </div>
      </form>
    </div>
    <p v-if="done" class="notice notice-success" role="status">Your export is downloading.</p>
    <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>
    <p class="group-footer">Spending can also download the transactions it's showing as a spreadsheet.</p>
  </section>
</template>
