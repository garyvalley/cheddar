import { attempt, sessionFor } from "~~/server/data/session";

export default defineEventHandler(async (event) => {
  assertSameOrigin(event);
  const s = sessionFor(event);
  const id = recordId(
    getRouterParam(event, "id"),
    "That household member isn't there.",
  );
  await attempt(
    () =>
      s.send(`/api/household/members/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),
    "That household member isn't there.",
  );
  setResponseStatus(event, 204);
});
