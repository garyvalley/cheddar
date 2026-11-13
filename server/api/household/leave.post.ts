import { attempt, sessionFor } from "~~/server/data/session";

export default defineEventHandler(async (event) => {
  assertSameOrigin(event);
  const s = sessionFor(event);
  await attempt(() => s.send("/api/household/leave", { method: "POST" }));
  setResponseStatus(event, 204);
});
