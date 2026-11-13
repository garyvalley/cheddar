// `balance_history_months`: a read-only view of `balance_history` keeping
// only each account's first and last balance of every month. Overview and
// Projections read the daily rows for the last year and this view before
// that (server/data/transactions.ts balanceHistory()), so what they read
// stops growing by a row per account per day forever (issue #35). Every
// sum they make needs only the latest balance at or before a day, and each
// account's first one, which this keeps.
//
// The same read rule as balance_history (0020): the owner, or a member of
// the household the account is shared with, with two-step sign-in on.
const RECORD_READ =
  "@request.auth.mfa_enabled = true && (owner = @request.auth.id || account.shared_household.members.id ?= @request.auth.id)";

const MONTH = (fn) =>
  `(SELECT ${fn}(x.date) FROM balance_history x WHERE x.account = b.account AND x.date >= substr(b.date, 1, 7) || '-01' AND x.date <= substr(b.date, 1, 7) || '-31')`;

export default async function up(pb) {
  if (await pb.collection("balance_history_months")) return;
  await pb.send("POST", "/api/collections", {
    name: "balance_history_months",
    type: "view",
    listRule: RECORD_READ,
    viewRule: RECORD_READ,
    viewQuery: `SELECT b.id, b.owner, b.account, b.date, b.balance_cents FROM balance_history b WHERE b.date = ${MONTH("MIN")} OR b.date = ${MONTH("MAX")}`,
  });
}
