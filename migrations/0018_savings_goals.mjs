// Goals are personal earmarks, not additional account balances or assets.
const MINE = "owner = @request.auth.id && @request.auth.mfa_enabled = true";
const CREATE_MINE =
  "@request.body.owner = @request.auth.id && @request.auth.mfa_enabled = true";
const KEEPS_OWNER =
  "(@request.body.owner:isset = false || @request.body.owner = @request.auth.id)";

export default async function up(pb) {
  if (await pb.collection("goals")) return;
  const users = await pb.collection("users");
  await pb.send("POST", "/api/collections", {
    name: "goals",
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
      { name: "name", type: "text", required: true, max: 60 },
      { name: "target_cents", type: "number", onlyInt: true, min: 1 },
      { name: "saved_cents", type: "number", onlyInt: true, min: 0 },
      {
        name: "target_date",
        type: "text",
        max: 10,
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
      },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE INDEX idx_goals_owner ON goals (owner, created)"],
  });
}
