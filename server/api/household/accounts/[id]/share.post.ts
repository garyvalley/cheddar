import { attempt, sessionFor } from "~~/server/data/session";

export default defineEventHandler(async (event) => {
  assertSameOrigin(event);
  const s = sessionFor(event);
  const id = recordId(getRouterParam(event, "id"), "That account isn't there.");
  const body = await readFields<{ shared: boolean }>(event, ["shared"]);
  return await attempt(
    () =>
      s.send(`/api/household/accounts/${encodeURIComponent(id)}/share`, {
        method: "POST",
        body,
      }),
    "That account isn't there.",
  );
});
