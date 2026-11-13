import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { APP, PB, PASSWORD, ready, superuser } from "./helpers.mjs";
import { unzip } from "../unzip.mjs";

const today = new Date().toISOString().slice(0, 10);

describe("household sharing", () => {
  test("requires acceptance, shares only selected accounts, permits transaction edits, and revokes access", async () => {
    const owner = await ready();
    const member = await ready();
    async function verify(address) {
      const token = await superuser();
      const found = await fetch(
        `${PB}/api/collections/users/records?filter=${encodeURIComponent(`email = '${address}'`)}`,
        { headers: { authorization: token } },
      );
      const user = (await found.json()).items[0];
      assert.ok(user);
      const updated = await fetch(
        `${PB}/api/collections/users/records/${user.id}`,
        {
          method: "PATCH",
          headers: { authorization: token, "content-type": "application/json" },
          body: JSON.stringify({ verified: true }),
        },
      );
      assert.equal(updated.status, 200);
    }
    const created = await owner.c.call("POST", "/api/accounts", {
      name: "Joint checking",
      kind: "checking",
    });
    assert.equal(created.status, 201, JSON.stringify(created.json));
    const account = created.json.account;
    await owner.c.call("PATCH", `/api/accounts/${account.id}`, {
      balance: "2000",
    });
    const transaction = await owner.c.call("POST", "/api/transactions", {
      account: account.id,
      posted: today,
      amount: "45",
      direction: "out",
      description: "Groceries",
    });
    assert.equal(transaction.status, 201, JSON.stringify(transaction.json));

    const household = await owner.c.call("POST", "/api/household", {
      name: "The Valley household",
    });
    assert.equal(household.status, 201, JSON.stringify(household.json));
    await verify(member.address);
    const invite = await owner.c.call("POST", "/api/household/invite", {
      email: member.address,
    });
    assert.equal(invite.status, 201, JSON.stringify(invite.json));
    assert.equal(
      (
        await owner.c.call(
          "POST",
          `/api/household/accounts/${account.id}/share`,
          { shared: true },
        )
      ).status,
      400,
    );

    const pending = await member.c.call("GET", "/api/household");
    assert.equal(pending.json.invitations.length, 1);
    assert.equal(
      (await member.c.call("GET", "/api/accounts")).json.accounts.length,
      0,
    );
    assert.equal(
      (
        await member.c.call(
          "POST",
          `/api/household/invites/${pending.json.invitations[0].id}/accept`,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await owner.c.call(
          "POST",
          `/api/household/accounts/${account.id}/share`,
          { shared: true },
        )
      ).status,
      200,
    );

    const sharedAccounts = (await member.c.call("GET", "/api/accounts")).json
      .accounts;
    assert.equal(sharedAccounts.length, 1);
    assert.deepEqual(
      [sharedAccounts[0].owned, sharedAccounts[0].shared],
      [false, true],
    );
    assert.equal(
      (await member.c.call("GET", "/api/overview")).json.net_worth.total_cents,
      200000,
    );
    assert.equal(
      (await member.c.call("GET", `/api/spending?at=${today.slice(0, 7)}`)).json
        .spent_cents,
      4500,
    );
    assert.equal(
      (await member.c.call("GET", "/api/projections")).json.invested_cents,
      0,
    );
    assert.equal(
      (await member.c.call("GET", "/api/cashflow")).json.accounts.length,
      0,
    );
    const visible = await member.c.call(
      "GET",
      `/api/transactions?account=${account.id}`,
    );
    assert.equal(visible.json.total, 1);
    const changed = await member.c.call(
      "PATCH",
      `/api/transactions/${transaction.json.transaction.id}`,
      { note: "Shared shopping" },
    );
    assert.equal(changed.status, 200, JSON.stringify(changed.json));
    assert.equal(changed.json.transaction.shared, true);
    assert.equal(
      (await owner.c.call("GET", `/api/transactions?account=${account.id}`))
        .json.items[0].note,
      "Shared shopping",
    );
    const token = decodeURIComponent(member.c.cookie.slice("pb_token=".length));
    const directRead = await fetch(
      `${PB}/api/collections/transactions/records/${transaction.json.transaction.id}`,
      {
        headers: { authorization: token },
      },
    );
    assert.equal(
      directRead.status,
      200,
      `direct shared read: ${directRead.status}`,
    );
    const direct = await fetch(
      `${PB}/api/collections/transactions/records/${transaction.json.transaction.id}`,
      {
        method: "PATCH",
        headers: { authorization: token, "content-type": "application/json" },
        body: JSON.stringify({ amount_cents: -99999 }),
      },
    );
    assert.ok(
      [400, 403, 404].includes(direct.status),
      `direct shared edit: ${direct.status}`,
    );
    const archive = await fetch(`${APP}/api/export`, {
      method: "POST",
      headers: {
        origin: APP,
        "content-type": "application/json",
        cookie: member.c.cookie,
        "x-forwarded-for": member.c.from,
      },
      body: JSON.stringify({ password: PASSWORD }),
    });
    assert.equal(archive.status, 200);
    const exported = JSON.parse(
      unzip(Buffer.from(await archive.arrayBuffer()))["cheddar.json"],
    );
    assert.deepEqual(exported.accounts, []);
    assert.deepEqual(exported.transactions, []);
    assert.notEqual(
      (
        await member.c.call("PATCH", `/api/accounts/${account.id}`, {
          balance: "3000",
        })
      ).status,
      200,
    );

    assert.equal(
      (
        await owner.c.call(
          "POST",
          `/api/household/accounts/${account.id}/share`,
          { shared: false },
        )
      ).status,
      200,
    );
    assert.equal(
      (await member.c.call("GET", "/api/accounts")).json.accounts.length,
      0,
    );
    assert.equal(
      (await member.c.call("GET", `/api/transactions?account=${account.id}`))
        .json.total,
      0,
    );
  });
});
