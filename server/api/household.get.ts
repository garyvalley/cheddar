import { attempt, sessionFor } from "~~/server/data/session";

export default defineEventHandler(async (event) => {
  const s = sessionFor(event);
  return await attempt(() => s.send("/api/household", { method: "GET" }));
});
