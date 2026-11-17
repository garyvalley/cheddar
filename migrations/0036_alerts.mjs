// Alerts by email (shared/alerts.ts, issue #105).
//   - `alert_settings`: what each person wants to hear about, one row each,
//     theirs alone with two-step sign-in on. `checked` is when the hooks
//     last looked for new charges; only the hooks write it
//     (pb_hooks/alerts.pb.js drops the record API's writes).
//   - `alert_log`: the alerts sent, by key, so each is sent once. Only the
//     hooks read or write it (all rules null); rows go after 120 days.
const MINE = "owner = @request.auth.id && @request.auth.mfa_enabled = true";
const CREATE_MINE =
  "@request.body.owner = @request.auth.id && @request.auth.mfa_enabled = true";
const KEEPS_OWNER =
  "(@request.body.owner:isset = false || @request.body.owner = @request.auth.id)";

export default async function up(pb) {
  const users = await pb.collection("users");
  const owner = {
    name: "owner",
    type: "relation",
    collectionId: users.id,
    maxSelect: 1,
    required: true,
    cascadeDelete: true,
  };
  if (!(await pb.collection("alert_settings"))) {
    await pb.send("POST", "/api/collections", {
      name: "alert_settings",
      type: "base",
      listRule: MINE,
      viewRule: MINE,
      createRule: CREATE_MINE,
      updateRule: `${MINE} && ${KEEPS_OWNER}`,
      deleteRule: MINE,
      fields: [
        owner,
        { name: "charge_over_cents", type: "number", onlyInt: true, min: 0, max: 1000000000 },
        { name: "balance_under_cents", type: "number", onlyInt: true, min: 0, max: 1000000000 },
        { name: "bills", type: "bool" },
        { name: "budgets", type: "bool" },
        { name: "banks", type: "bool" },
        { name: "weekly", type: "bool" },
        { name: "checked", type: "date" },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_alert_settings_owner ON alert_settings (owner)",
      ],
    });
  }
  if (!(await pb.collection("alert_log"))) {
    await pb.send("POST", "/api/collections", {
      name: "alert_log",
      type: "base",
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        owner,
        { name: "key", type: "text", required: true, max: 200 },
        { name: "kind", type: "text", required: true, max: 20 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_alert_log_owner_key ON alert_log (owner, key)",
        "CREATE INDEX idx_alert_log_created ON alert_log (created)",
      ],
    });
  }
}
