import { attempt, sessionFor } from "~~/server/data/session";

export default defineEventHandler(async (event) => {
  assertSameOrigin(event);
  const s = sessionFor(event);
  const body = await readFields<{ name: string }>(event, ["name"]);
  const result = await attempt(() =>
    s.send("/api/household", { method: "POST", body }),
  );
  setResponseStatus(event, 201);
  return result;
});
