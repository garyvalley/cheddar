<script setup lang="ts">
import type { Import } from '~~/shared/accounts'

// An account's past imports on the Import page, newest first, each of which
// can be undone (its transactions go). Emits `undone` with the import's id
// once one is, so the page can drop it from what it just showed.

defineProps<{ imports: Import[], accountName: string }>()
const emit = defineEmits<{ undone: [id: string] }>()

const undo = useAction()
const undoing = ref('')
async function undoImport(id: string) {
  undoing.value = id
  if (await undo.succeed(() => $fetch(`/api/imports/${id}`, { method: 'DELETE' }))) emit('undone', id)
  undoing.value = ''
}

const when = (iso: string) => new Date(iso.replace(' ', 'T')).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
const day = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`
</script>

<template>
  <section class="group" aria-labelledby="history-title">
    <h2 id="history-title" class="group-title">Imported into {{ accountName }}</h2>
    <ul class="card list">
      <li v-for="i in imports" :key="i.id" class="row">
        <span class="row-label">
          <span class="block name">{{ i.filename || 'Statement' }}</span>
          <span class="footnote">
            {{ when(i.created) }} · {{ plural(i.added, 'added', 'added') }}<template v-if="i.skipped">, {{ i.skipped }} already there</template>
            <template v-if="i.first_date"> · {{ day(i.first_date) }} to {{ day(i.last_date) }}</template>
          </span>
        </span>
        <button class="btn btn-plain" :disabled="undo.busy.value" :aria-label="`Undo the import of ${i.filename}`" @click="undoImport(i.id)">
          <span v-if="undoing === i.id" class="spinner" aria-hidden="true" /> Undo
        </button>
      </li>
    </ul>
    <p v-if="undo.error.value" class="notice notice-error" role="alert">{{ undo.error.value }}</p>
    <p class="group-footer">Undo removes the transactions that import added.</p>
  </section>
</template>

<style scoped>
.list { list-style: none; margin: 0; padding: 0; }
.name { overflow-wrap: anywhere; }
</style>
