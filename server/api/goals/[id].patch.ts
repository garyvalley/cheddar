import { getGoal, updateGoal } from "~~/server/data/goals";
import { attempt, sessionFor } from "~~/server/data/session";
import { checkGoal } from "~~/shared/goals";

export default defineEventHandler(async (event) => {
  assertSameOrigin(event);
  const s = sessionFor(event);
  const id = recordId(getRouterParam(event, "id"), "That goal isn't there.");
  const current = await attempt(() => getGoal(s, id), "That goal isn't there.");
  const body = await readFields<Record<string, unknown>>(event, [
    "name",
    "target",
    "saved",
    "target_date",
  ]);
  const checked = checkGoal({
    name: current.name,
    target: current.target_cents / 100,
    saved: current.saved_cents / 100,
    target_date: current.target_date,
    ...body,
  });
  if ("problem" in checked)
    throw createError({ statusCode: 400, statusMessage: checked.problem });
  return {
    goal: await attempt(
      () => updateGoal(s, id, checked.ok),
      "That goal isn't there.",
    ),
  };
});
