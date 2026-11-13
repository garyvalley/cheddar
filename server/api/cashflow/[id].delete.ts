import { deleteCashflowItem } from "~~/server/data/cashflow";
import { attempt, sessionFor } from "~~/server/data/session";

export default defineEventHandler(async (event) => {
  assertSameOrigin(event);
  const s = sessionFor(event);
  const id = recordId(
    getRouterParam(event, "id"),
    "That planned item isn't there.",
  );
  await attempt(
    () => deleteCashflowItem(s, id),
    "That planned item isn't there.",
  );
  setResponseStatus(event, 204);
});
