<script setup lang="ts">
import { RECEIPTS_PER_TRANSACTION, type Receipt } from '~~/shared/receipts'

// Receipts kept with one of the person's own transactions (shared/receipts.ts):
// photos or PDFs, at full size. Shown inside the transaction's editor on
// Spending.

const props = defineProps<{ transaction: string }>()
const receipts = ref<Receipt[]>([])
const action = useAction()
const loading = ref(true)
const deleting = ref('')
const input = ref<HTMLInputElement>()

async function load() {
  const r = await action.run(() => $fetch<{ receipts: Receipt[] }>(`/api/transactions/${props.transaction}/receipts`))
  if (r) receipts.value = r.receipts
  loading.value = false
}
onMounted(load)

async function add(event: Event) {
  const files = [...((event.target as HTMLInputElement).files ?? [])].slice(0, RECEIPTS_PER_TRANSACTION - receipts.value.length)
  for (const file of files) {
    const made = await action.run(async () => {
      const r = await receiptOf(file)
      if ('problem' in r) throw new Error(r.problem)
      const body = new FormData()
      body.set('file', r, file.name)
      body.set('name', r === file ? file.name : `${file.name.replace(/\.[A-Za-z0-9]{1,5}$/, '') || 'Receipt'}.jpg`)
      return await $fetch<{ receipt: Receipt }>(`/api/transactions/${props.transaction}/receipts`, { method: 'POST', body })
    })
    if (!made) break
    receipts.value = [...receipts.value, made.receipt]
  }
  if (input.value) input.value.value = ''
}

async function remove(r: Receipt) {
  if (await action.succeed(() => $fetch(`/api/receipts/${r.id}`, { method: 'DELETE' }))) {
    receipts.value = receipts.value.filter(x => x.id !== r.id)
  }
  deleting.value = ''
}

const size = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`)
</script>

<template>
  <div class="field receipts" data-test="receipts">
    <span class="field-label">Receipts</span>
    <p v-if="loading" class="footnote"><span class="spinner" aria-hidden="true" /> Loading…</p>
    <ul v-else-if="receipts.length" class="items">
      <li v-for="r in receipts" :key="r.id" class="item">
        <a :href="`/api/receipts/${r.id}`" target="_blank" rel="noopener" class="thumb" :aria-label="`Open ${r.name}`">
          <img v-if="r.type.startsWith('image/') && !r.type.startsWith('image/hei')" :src="`/api/receipts/${r.id}`" alt="" loading="lazy">
          <span v-else class="pdf" aria-hidden="true">{{ r.type === 'application/pdf' ? 'PDF' : 'Photo' }}</span>
        </a>
        <span class="about">
          <span class="block name">{{ r.name }}</span>
          <span class="footnote">{{ size(r.size) }}</span>
        </span>
        <span v-if="deleting === r.id" class="btn-row">
          <button type="button" class="btn btn-plain" @click="deleting = ''">Keep</button>
          <button type="button" class="btn btn-danger" :disabled="action.busy.value" @click="remove(r)">Delete</button>
        </span>
        <button v-else type="button" class="btn btn-plain" :aria-label="`Delete ${r.name}`" @click="deleting = r.id">Delete…</button>
      </li>
    </ul>
    <label v-if="!loading && receipts.length < RECEIPTS_PER_TRANSACTION" class="btn btn-tinted add">
      <span v-if="action.busy.value" class="spinner" aria-hidden="true" />
      {{ receipts.length ? 'Add another receipt' : 'Add a receipt' }}
      <input ref="input" type="file" class="visually-hidden" accept="image/*,application/pdf" multiple :disabled="action.busy.value" @change="add">
    </label>
    <span class="footnote block">A photo or a PDF, for warranties, returns or getting paid back, kept at full size (up to 10 MB each).</span>
    <p v-if="action.error.value" class="notice notice-error" role="alert">{{ action.error.value }}</p>
  </div>
</template>

<style scoped>
.items { list-style: none; margin: 0 0 0.5rem; padding: 0; display: grid; gap: 0.5rem; }
.item { display: flex; align-items: center; gap: 0.75rem; }
.thumb {
  flex: none; width: 3.5rem; height: 3.5rem; border-radius: 0.5rem; overflow: hidden;
  border: var(--border); background: var(--surface-2, var(--bg)); display: grid; place-items: center;
}
.thumb img { width: 100%; height: 100%; object-fit: cover; }
.pdf { font-size: 0.75rem; font-weight: 600; color: var(--text-2); }
.about { flex: 1; min-width: 0; }
.name { overflow-wrap: anywhere; }
.add { cursor: pointer; }
</style>
