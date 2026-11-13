/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "GET",
  "/api/household",
  (e) => {
    if (!e.auth.getBool("mfa_enabled"))
      throw new ForbiddenError("Turn on two-step sign-in first.");
    var household = null;
    try {
      household = e.app.findFirstRecordByFilter(
        "households",
        "members.id ?= {:user}",
        { user: e.auth.id },
      );
    } catch (_) {
      /* no matching household */
    }
    var members = household ? household.get("members") || [] : [];
    var memberInfo = members.map(function (id) {
      var user = e.app.findRecordById("users", id);
      return {
        id: id,
        email: user.getString("email"),
        name: user.getString("name"),
        owner: id === (household ? household.getString("owner") : ""),
      };
    });
    var accounts = household
      ? e.app
          .findRecordsByFilter("accounts", "owner = {:owner}", "name", 0, 0, {
            owner: e.auth.id,
          })
          .map(function (account) {
            return {
              id: account.id,
              name: account.getString("name"),
              shared: account.getString("shared_household") === household.id,
            };
          })
      : [];
    var pending = e.app
      .findRecordsByFilter(
        "household_invites",
        "invitee = {:user}",
        "-created",
        50,
        0,
        { user: e.auth.id },
      )
      .map(function (invite) {
        var group = e.app.findRecordById(
          "households",
          invite.getString("household"),
        );
        return {
          id: invite.id,
          name: group.getString("name"),
          invited_by: e.app
            .findRecordById("users", invite.getString("invited_by"))
            .getString("name"),
        };
      });
    return e.json(200, {
      household: household
        ? {
            id: household.id,
            name: household.getString("name"),
            owner: household.getString("owner"),
            members: memberInfo,
          }
        : null,
      accounts: accounts,
      invitations: pending,
    });
  },
  $apis.requireAuth("users"),
);

routerAdd(
  "POST",
  "/api/household",
  (e) => {
    if (!e.auth.getBool("mfa_enabled"))
      throw new ForbiddenError("Turn on two-step sign-in first.");
    var existing = null;
    try {
      existing = e.app.findFirstRecordByFilter(
        "households",
        "members.id ?= {:user}",
        { user: e.auth.id },
      );
    } catch (_) {
      /* no matching household */
    }
    if (existing)
      throw new BadRequestError("You already belong to a household.");
    var name = String((e.requestInfo().body || {}).name || "").trim();
    if (!name || name.length > 60)
      throw new BadRequestError(
        "Give the household a name of up to 60 characters.",
      );
    var household = new Record(e.app.findCollectionByNameOrId("households"));
    household.set("owner", e.auth.id);
    household.set("members", [e.auth.id]);
    household.set("name", name);
    e.app.save(household);
    return e.json(201, {
      household: {
        id: household.id,
        name: name,
        owner: e.auth.id,
        members: [
          {
            id: e.auth.id,
            email: e.auth.getString("email"),
            name: e.auth.getString("name"),
            owner: true,
          },
        ],
      },
    });
  },
  $apis.requireAuth("users"),
);

routerAdd(
  "POST",
  "/api/household/invite",
  (e) => {
    if (!e.auth.getBool("mfa_enabled"))
      throw new ForbiddenError("Turn on two-step sign-in first.");
    var household = null;
    try {
      household = e.app.findFirstRecordByFilter(
        "households",
        "members.id ?= {:user}",
        { user: e.auth.id },
      );
    } catch (_) {
      /* no matching household */
    }
    if (!household) throw new NotFoundError("That household isn't there.");
    if (household.getString("owner") !== e.auth.id)
      throw new ForbiddenError("Only the household owner can do that.");
    var email = String((e.requestInfo().body || {}).email || "")
      .trim()
      .toLowerCase();
    if (!email || email.length > 254)
      throw new BadRequestError(
        "Enter the email of an existing Cheddar account.",
      );
    var invitee;
    try {
      invitee = e.app.findFirstRecordByFilter(
        "users",
        "email:lower = {:email}",
        { email: email },
      );
    } catch (_) {
      throw new BadRequestError(
        "That verified Cheddar account isn't available to invite.",
      );
    }
    var alreadyMember = null;
    try {
      alreadyMember = e.app.findFirstRecordByFilter(
        "households",
        "members.id ?= {:user}",
        { user: invitee.id },
      );
    } catch (_) {
      /* no matching invitation */
    }
    if (
      !invitee.getBool("verified") ||
      invitee.id === e.auth.id ||
      alreadyMember
    ) {
      throw new BadRequestError(
        "That verified Cheddar account isn't available to invite.",
      );
    }
    var pending = null;
    try {
      pending = e.app.findFirstRecordByFilter(
        "household_invites",
        "household = {:household} && invitee = {:invitee}",
        { household: household.id, invitee: invitee.id },
      );
    } catch (_) {
      /* no matching household */
    }
    if (pending)
      throw new BadRequestError(
        "An invitation is already waiting for that person.",
      );
    var invite = new Record(
      e.app.findCollectionByNameOrId("household_invites"),
    );
    invite.set("household", household.id);
    invite.set("invitee", invitee.id);
    invite.set("invited_by", e.auth.id);
    e.app.save(invite);
    return e.json(201, { invited: true });
  },
  $apis.requireAuth("users"),
);

routerAdd(
  "POST",
  "/api/household/invites/{id}/accept",
  (e) => {
    if (!e.auth.getBool("mfa_enabled"))
      throw new ForbiddenError("Turn on two-step sign-in first.");
    var invite;
    try {
      invite = e.app.findRecordById(
        "household_invites",
        e.request.pathValue("id"),
      );
    } catch (_) {
      throw new NotFoundError("That invitation isn't there.");
    }
    if (invite.getString("invitee") !== e.auth.id)
      throw new NotFoundError("That invitation isn't there.");
    var existing = null;
    try {
      existing = e.app.findFirstRecordByFilter(
        "households",
        "members.id ?= {:user}",
        { user: e.auth.id },
      );
    } catch (_) {
      /* no matching household */
    }
    if (existing)
      throw new BadRequestError("You already belong to a household.");
    var household = e.app.findRecordById(
      "households",
      invite.getString("household"),
    );
    var members = household.get("members") || [];
    if (members.length >= 20)
      throw new BadRequestError("That household has reached its member limit.");
    members.push(e.auth.id);
    household.set("members", members);
    e.app.runInTransaction(function (txApp) {
      txApp.save(household);
      txApp.delete(invite);
    });
    var memberInfo = members.map(function (id) {
      var user = e.app.findRecordById("users", id);
      return {
        id: id,
        email: user.getString("email"),
        name: user.getString("name"),
        owner: id === household.getString("owner"),
      };
    });
    return e.json(200, {
      household: {
        id: household.id,
        name: household.getString("name"),
        owner: household.getString("owner"),
        members: memberInfo,
      },
    });
  },
  $apis.requireAuth("users"),
);

routerAdd(
  "DELETE",
  "/api/household/members/{id}",
  (e) => {
    if (!e.auth.getBool("mfa_enabled"))
      throw new ForbiddenError("Turn on two-step sign-in first.");
    var household = null;
    try {
      household = e.app.findFirstRecordByFilter(
        "households",
        "members.id ?= {:user}",
        { user: e.auth.id },
      );
    } catch (_) {
      /* no matching household */
    }
    if (!household) throw new NotFoundError("That household isn't there.");
    if (household.getString("owner") !== e.auth.id)
      throw new ForbiddenError("Only the household owner can do that.");
    var user = e.request.pathValue("id");
    if (user === e.auth.id)
      throw new BadRequestError(
        "Remove other members before closing the household.",
      );
    var members = household.get("members") || [];
    if (!members.includes(user))
      throw new NotFoundError("That household member isn't there.");
    household.set(
      "members",
      members.filter(function (id) {
        return id !== user;
      }),
    );
    e.app.save(household);
    e.app
      .findRecordsByFilter(
        "household_invites",
        "household = {:household} && invitee = {:invitee}",
        "",
        0,
        0,
        { household: household.id, invitee: user },
      )
      .forEach(function (invite) {
        e.app.delete(invite);
      });
    return e.noContent(204);
  },
  $apis.requireAuth("users"),
);

routerAdd(
  "POST",
  "/api/household/leave",
  (e) => {
    if (!e.auth.getBool("mfa_enabled"))
      throw new ForbiddenError("Turn on two-step sign-in first.");
    var household = null;
    try {
      household = e.app.findFirstRecordByFilter(
        "households",
        "members.id ?= {:user}",
        { user: e.auth.id },
      );
    } catch (_) {
      /* no matching household */
    }
    if (!household) throw new NotFoundError("That household isn't there.");
    var members = household.get("members") || [];
    if (household.getString("owner") === e.auth.id) {
      if (members.length > 1)
        throw new BadRequestError(
          "Remove other members before closing the household.",
        );
      e.app
        .findRecordsByFilter(
          "accounts",
          "shared_household = {:household}",
          "",
          0,
          0,
          { household: household.id },
        )
        .forEach(function (account) {
          account.set("shared_household", "");
          e.app.save(account);
        });
      e.app.delete(household);
    } else {
      household.set(
        "members",
        members.filter(function (id) {
          return id !== e.auth.id;
        }),
      );
      e.app.save(household);
    }
    return e.noContent(204);
  },
  $apis.requireAuth("users"),
);

routerAdd(
  "POST",
  "/api/household/accounts/{id}/share",
  (e) => {
    if (!e.auth.getBool("mfa_enabled"))
      throw new ForbiddenError("Turn on two-step sign-in first.");
    var household = null;
    try {
      household = e.app.findFirstRecordByFilter(
        "households",
        "members.id ?= {:user}",
        { user: e.auth.id },
      );
    } catch (_) {
      /* no matching household */
    }
    if (!household) throw new NotFoundError("That household isn't there.");
    if (household.getString("owner") !== e.auth.id)
      throw new ForbiddenError("Only the household owner can do that.");
    var account;
    try {
      account = e.app.findRecordById("accounts", e.request.pathValue("id"));
    } catch (_) {
      throw new NotFoundError("That account isn't there.");
    }
    if (account.getString("owner") !== e.auth.id)
      throw new NotFoundError("That account isn't there.");
    var shared = (e.requestInfo().body || {}).shared;
    if (typeof shared !== "boolean")
      throw new BadRequestError("Say whether to share this account.");
    if (shared && (household.get("members") || []).length < 2)
      throw new BadRequestError(
        "Invite a household member before sharing an account.",
      );
    account.set("shared_household", shared ? household.id : "");
    e.app.save(account);
    return e.json(200, { shared: shared });
  },
  $apis.requireAuth("users"),
);

onRecordDelete((e) => {
  if (e.record.collection().name === "users") {
    var user = e.record.id;
    e.app
      .findRecordsByFilter("households", "owner = {:user}", "", 0, 0, {
        user: user,
      })
      .forEach(function (household) {
        e.app
          .findRecordsByFilter(
            "accounts",
            "shared_household = {:household}",
            "",
            0,
            0,
            { household: household.id },
          )
          .forEach(function (account) {
            account.set("shared_household", "");
            e.app.save(account);
          });
        e.app.delete(household);
      });
    e.app
      .findRecordsByFilter("households", "members.id ?= {:user}", "", 0, 0, {
        user: user,
      })
      .forEach(function (household) {
        if (household.getString("owner") === user) return;
        household.set(
          "members",
          (household.get("members") || []).filter(function (id) {
            return id !== user;
          }),
        );
        e.app.save(household);
      });
    e.app
      .findRecordsByFilter(
        "household_invites",
        "invitee = {:user} || invited_by = {:user}",
        "",
        0,
        0,
        { user: user },
      )
      .forEach(function (invite) {
        e.app.delete(invite);
      });
  }
  e.next();
}, "users");
