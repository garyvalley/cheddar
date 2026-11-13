<script setup lang="ts">
import { formatCents } from '~~/shared/accounts'
import { checkGoal, monthlyGoalAmount, type Goal } from '~~/shared/goals'

const { data, refresh } = await useFetch<{ goals: Goal[] }>('/api/goals', { default: () => ({ goals: [] }) })
const today = useToday()
const create = useAction()
const save = useAction()
const remove = useAction()
const editing = ref('')
const deleting = ref('')
const form = reactive({ name: '', target: '', saved: '0', target_date: '' })
const editingGoal = computed(() => !!editing.value)

function beginEdit(goal: Goal) {
  editing.value = goal.id
  deleting.value = ''
  Object.assign(form, {
    name: goal.name,
    target: (goal.target_cents / 100).toFixed(2),
    saved: (goal.saved_cents / 100).toFixed(2),
    target_date: goal.target_date,
  })
  save.error.value = ''
}

function cancelEdit() {
  editing.value = ''
  Object.assign(form, { name: '', target: '', saved: '0', target_date: '' })
}

async function submit() {
  const checked = checkGoal(form)
  if ('problem' in checked) {
    const action = editingGoal.value ? save : create
    action.error.value = checked.problem
    return
  }
  const action = editingGoal.value ? save : create
  const result = await action.run(() => $fetch(editingGoal.value ? `/api/goals/${editing.value}` : '/api/goals', {
    method: editingGoal.value ? 'PATCH' : 'POST',
    body: form,
  }))
  if (!result) return
  cancelEdit()
  await refresh()
}

async function deleteGoal(goal: Goal) {
  if (!await remove.succeed(() => $fetch(`/api/goals/${goal.id}`, { method: 'DELETE' }))) return
  deleting.value = ''
  if (editing.value === goal.id) cancelEdit()
  await refresh()
}

const progress = (goal: Goal) => Math.min(100, Math.round(goal.saved_cents / goal.target_cents * 100))
const due = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
</script>

<template>
  <div>
    <AppHeader title="Goals" sub="Set money aside for what matters next." />

    <section class="group" aria-labelledby="goal-form-title">
      <h2 id="goal-form-title" class="group-title">{{ editingGoal ? 'Update goal' : 'Add a goal' }}</h2>
      <form class="card goal-form" @submit.prevent="submit">
        <label class="field">
          <span class="field-label">Goal</span>
          <input v-model="form.name" class="input" maxlength="60" placeholder="Emergency fund" required>
        </label>
        <div class="pair">
          <label class="field">
            <span class="field-label">Target amount</span>
            <input v-model="form.target" class="input num" inputmode="decimal" placeholder="$5,000.00" required>
          </label>
          <label class="field">
            <span class="field-label">Set aside so far</span>
            <input v-model="form.saved" class="input num" inputmode="decimal" placeholder="$0.00" required>
          </label>
        </div>
        <label class="field">
          <span class="field-label">Target date (optional)</span>
          <input v-model="form.target_date" class="input" type="date" :min="today">
        </label>
        <div class="field btn-row">
          <button class="btn btn-primary" :disabled="create.busy.value || save.busy.value">
            <span v-if="create.busy.value || save.busy.value" class="spinner" aria-hidden="true" />
            {{ editingGoal ? 'Save changes' : 'Add goal' }}
          </button>
          <button v-if="editingGoal" type="button" class="btn btn-plain" @click="cancelEdit">Cancel</button>
        </div>
      </form>
      <p v-if="create.error.value || save.error.value" class="notice notice-error" role="alert">{{ create.error.value || save.error.value }}</p>
    </section>

    <section class="group" aria-labelledby="goals-title">
      <h2 id="goals-title" class="group-title">Your goals</h2>
      <div v-if="!data.goals.length" class="card card-pad">
        <p class="muted">No goals yet.</p>
      </div>
      <ul v-else class="card list">
        <li v-for="goal in data.goals" :key="goal.id" class="goal-item">
          <template v-if="deleting === goal.id">
            <span class="row-label">Delete {{ goal.name }}?</span>
            <button class="btn btn-plain" @click="deleting = ''">Cancel</button>
            <button class="btn btn-danger" :disabled="remove.busy.value" @click="deleteGoal(goal)">Delete</button>
          </template>
          <template v-else>
            <div class="goal-head">
              <div class="row-label">
                <h3 class="goal-name">{{ goal.name }}</h3>
                <p class="footnote">
                  {{ formatCents(goal.saved_cents) }} of {{ formatCents(goal.target_cents) }}
                  <template v-if="goal.target_date"> · By {{ due(goal.target_date) }}</template>
                </p>
              </div>
              <span class="num percent">{{ progress(goal) }}%</span>
            </div>
            <progress class="progress" :value="progress(goal)" max="100" :aria-label="`${goal.name}: ${progress(goal)} percent funded`" />
            <p v-if="monthlyGoalAmount(goal, today) !== null" class="footnote">
              Set aside about <span class="num">{{ formatCents(monthlyGoalAmount(goal, today)!) }}</span> a month to meet the date.
            </p>
            <p v-else-if="goal.saved_cents >= goal.target_cents" class="footnote">Goal reached.</p>
            <div class="goal-actions">
              <button class="btn btn-plain" @click="beginEdit(goal)">Edit</button>
              <button class="btn btn-plain danger" @click="deleting = goal.id">Delete</button>
            </div>
          </template>
        </li>
      </ul>
      <p v-if="remove.error.value" class="notice notice-error" role="alert">{{ remove.error.value }}</p>
      <p class="group-footer">These amounts are your own earmarks of money already in your accounts; they do not change balances or net worth.</p>
    </section>
  </div>
</template>

<style scoped>
.goal-form { padding: 0 1.25rem; }
.pair { display: flex; flex-wrap: wrap; gap: 0.75rem; }
.pair .field { flex: 1 1 12rem; }
.list { list-style: none; margin: 0; padding: 0; }
.goal-item { padding: 1rem 1.25rem; }
.goal-item + .goal-item { border-top: var(--border); }
.goal-head { display: flex; align-items: flex-start; gap: 1rem; }
.goal-name { margin: 0; font-size: 1rem; font-weight: 600; }
.goal-head p { margin: 0.25rem 0 0; }
.percent { font-weight: 600; }
.progress { display: block; width: 100%; height: 0.5rem; margin: 0.875rem 0; accent-color: var(--gain); }
.goal-actions { display: flex; gap: 0.25rem; margin: 0.5rem -0.5rem -0.5rem; }
.danger { color: var(--critical); }
</style>