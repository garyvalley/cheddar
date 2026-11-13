// Household members may edit notes, names, exclusions, and review state, but not the owner's bank transaction details or splits.
const KEEPS_OWNER =
  "(@request.body.owner:isset = false || @request.body.owner = @request.auth.id)";
const KEEPS_ACCOUNT =
  "(@request.body.account:isset = false || @request.body.account = account)";
const OWNER_EDIT = "owner = @request.auth.id";
const SHARED_EDIT = [
  "account.shared_household.members.id ?= @request.auth.id",
  "@request.body.posted:changed = false",
  "@request.body.amount_cents:changed = false",
  "@request.body.description:changed = false",
  "@request.body.source:changed = false",
  "@request.body.external_id:changed = false",
  "@request.body.import:changed = false",
  "@request.body.pending:changed = false",
  "@request.body.category:changed = false",
  "@request.body.category_by:changed = false",
  "@request.body.bank_category:changed = false",
  "@request.body.merchant_key:changed = false",
  "@request.body.splits:changed = false",
].join(" && ");

export default async function up(pb) {
  const updateRule = `@request.auth.mfa_enabled = true && ${KEEPS_OWNER} && ${KEEPS_ACCOUNT} && (${OWNER_EDIT} || (${SHARED_EDIT}))`;
  await pb.send("PATCH", "/api/collections/transactions", {
    updateRule,
  });
}
