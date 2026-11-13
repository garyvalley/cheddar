// Planned income and expenses belong to their owner and a counted account.
const MINE = "owner = @request.auth.id && @request.auth.mfa_enabled = true";
const CREATE_MINE =
  "@request.body.owner = @request.auth.id && @request.auth.mfa_enabled = true";
const KEEPS_OWNER =
  "(@request.body.owner:isset = false || @request.body.owner = @request.auth.id)";
const IN_MY_ACCOUNT = "account.owner = @request.auth.id";

export default async function up(pb) {
  if (await pb.collection("cashflow_items")) return;
  const users = await pb.collection("users");
  const accounts = await pb.collection("accounts");
  await pb.send("POST", "/api/collections", {
    name: "cashflow_items",
    type: "base",
    listRule: MINE,
    viewRule: MINE,
    createRule: `${CREATE_MINE} && ${IN_MY_ACCOUNT}`,
    updateRule: `${MINE} && ${KEEPS_OWNER} && ${IN_MY_ACCOUNT}`,
    deleteRule: MINE,
    fields: [
      {
        name: "owner",
        type: "relation",
        collectionId: users.id,
        maxSelect: 1,
        required: true,
        cascadeDelete: true,
      },
      {
        name: "account",
        type: "relation",
        collectionId: accounts.id,
        maxSelect: 1,
        required: true,
        cascadeDelete: true,
      },
      { name: "name", type: "text", required: true, max: 100 },
      {
        name: "direction",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["income", "expense"],
      },
      { name: "amount_cents", type: "number", onlyInt: true, min: 1 },
      {
        name: "cadence",
        type: "select",
        required: true,
        maxSelect: 1,
        values: [
          "once",
          "weekly",
          "biweekly",
          "monthly",
          "quarterly",
          "yearly",
        ],
      },
      {
        name: "next_date",
        type: "text",
        required: true,
        max: 10,
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
      },
      { name: "source_key", type: "text", max: 100 },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE INDEX idx_cashflow_items_owner_date ON cashflow_items (owner, next_date)",
    ],
  });
}
