// Monthly budgets per spending category (shared/budgets.ts). Each person's
// own, with two-step sign-in on: nobody reads or sets another's, and one
// row per category (the unique index) so a budget can't be counted twice.
const MINE = "owner = @request.auth.id && @request.auth.mfa_enabled = true";
const CREATE_MINE =
  "@request.body.owner = @request.auth.id && @request.auth.mfa_enabled = true";
const KEEPS_OWNER =
  "(@request.body.owner:isset = false || @request.body.owner = @request.auth.id)";

export default async function up(pb) {
  if (await pb.collection("budgets")) return;
  const users = await pb.collection("users");
  await pb.send("POST", "/api/collections", {
    name: "budgets",
    type: "base",
    listRule: MINE,
    viewRule: MINE,
    createRule: CREATE_MINE,
    updateRule: `${MINE} && ${KEEPS_OWNER}`,
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
        name: "category",
        type: "text",
        required: true,
        max: 20,
        pattern: "^([a-z]{2,20}|c-[a-z0-9]{15})$",
      },
      {
        name: "amount_cents",
        type: "number",
        onlyInt: true,
        min: 1,
        max: 1000000000,
        required: true,
      },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_budgets_owner_category ON budgets (owner, category)",
    ],
  });
}
