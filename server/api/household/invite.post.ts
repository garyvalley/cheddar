import { attempt, sessionFor } from "~~/server/data/session";

export default defineEventHandler(async (event) => {
  assertSameOrigin(event);
  const s = sessionFor(event);
  const body = await readFields<{ email: string }>(event, ["email"]);
  const result = await attempt(() =>
    s.send("/api/household/invite", { method: "POST", body }),
  );
  setResponseStatus(event, 201);
  return result;
});
