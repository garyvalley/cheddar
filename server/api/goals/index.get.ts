import { listGoals } from "~~/server/data/goals";
import { attempt, sessionFor } from "~~/server/data/session";

export default defineEventHandler(async (event) => {
  const s = sessionFor(event);
  return { goals: await attempt(() => listGoals(s)) };
});
