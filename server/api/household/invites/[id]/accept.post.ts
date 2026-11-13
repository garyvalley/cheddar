import { attempt, sessionFor } from "~~/server/data/session";

export default defineEventHandler(async (event) => {
  assertSameOrigin(event);
  const s = sessionFor(event);
  const id = recordId(
    getRouterParam(event, "id"),
    "That invitation isn't there.",
  );
  return await attempt(
    () =>
      s.send(`/api/household/invites/${encodeURIComponent(id)}/accept`, {
        method: "POST",
      }),
    "That invitation isn't there.",
  );
});
