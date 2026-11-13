import { deleteGoal } from "~~/server/data/goals";
import { attempt, sessionFor } from "~~/server/data/session";

export default defineEventHandler(async (event) => {
  assertSameOrigin(event);
  const s = sessionFor(event);
  const id = recordId(getRouterParam(event, "id"), "That goal isn't there.");
  await attempt(() => deleteGoal(s, id), "That goal isn't there.");
  setResponseStatus(event, 204);
});
