import { createGoal } from "~~/server/data/goals";
import { attempt, sessionFor } from "~~/server/data/session";
import { checkGoal } from "~~/shared/goals";

export default defineEventHandler(async (event) => {
  assertSameOrigin(event);
  const s = sessionFor(event);
  const body = await readFields<Record<string, unknown>>(event, [
    "name",
    "target",
    "saved",
    "target_date",
  ]);
  const checked = checkGoal(body);
  if ("problem" in checked)
    throw createError({ statusCode: 400, statusMessage: checked.problem });
  setResponseStatus(event, 201);
  return { goal: await attempt(() => createGoal(s, checked.ok)) };
});
