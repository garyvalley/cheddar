// Households share only accounts their owner explicitly selects; memberships never grant account-management rights.
const MINE =
  "@request.auth.mfa_enabled = true && (owner = @request.auth.id || shared_household.members.id ?= @request.auth.id)";
const RECORD_READ =
  "@request.auth.mfa_enabled = true && (owner = @request.auth.id || account.shared_household.members.id ?= @request.auth.id)";
const KEEPS_OWNER =
  "(@request.body.owner:isset = false || @request.body.owner = @request.auth.id)";
const KEEPS_ACCOUNT =
  "(@request.body.account:isset = false || @request.body.account = account)";
const RECORD_UPDATE = `@request.auth.mfa_enabled = true && ${KEEPS_OWNER} && ${KEEPS_ACCOUNT} && (owner = @request.auth.id || account.shared_household.members.id ?= @request.auth.id)`;

export default async function up(pb) {
  const users = await pb.collection("users");
  if (!(await pb.collection("households"))) {
    await pb.send("POST", "/api/collections", {
      name: "households",
      type: "base",
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
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
          name: "members",
          type: "relation",
          collectionId: users.id,
          maxSelect: 20,
          required: true,
        },
        { name: "name", type: "text", required: true, max: 60 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: ["CREATE INDEX idx_households_owner ON households (owner)"],
    });
  }
  const households = await pb.collection("households");
  if (!(await pb.collection("household_invites"))) {
    await pb.send("POST", "/api/collections", {
      name: "household_invites",
      type: "base",
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: "household",
          type: "relation",
          collectionId: households.id,
          maxSelect: 1,
          required: true,
          cascadeDelete: true,
        },
        {
          name: "invitee",
          type: "relation",
          collectionId: users.id,
          maxSelect: 1,
          required: true,
          cascadeDelete: true,
        },
        {
          name: "invited_by",
          type: "relation",
          collectionId: users.id,
          maxSelect: 1,
          required: true,
          cascadeDelete: true,
        },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_household_invites_person ON household_invites (household, invitee)",
      ],
    });
  }

  const accounts = await pb.collection("accounts");
  const accountFields = [...accounts.fields];
  if (!accountFields.some((field) => field.name === "shared_household")) {
    accountFields.push({
      name: "shared_household",
      type: "relation",
      collectionId: households.id,
      maxSelect: 1,
      cascadeDelete: false,
    });
  }
  await pb.send("PATCH", "/api/collections/accounts", {
    fields: accountFields,
    listRule: MINE,
    viewRule: MINE,
  });

  await pb.send("PATCH", "/api/collections/transactions", {
    listRule: RECORD_READ,
    viewRule: RECORD_READ,
    updateRule: RECORD_UPDATE,
  });

  await pb.send("PATCH", "/api/collections/imports", {
    listRule: RECORD_READ,
    viewRule: RECORD_READ,
  });

  await pb.send("PATCH", "/api/collections/balance_history", {
    listRule: RECORD_READ,
    viewRule: RECORD_READ,
  });
}
