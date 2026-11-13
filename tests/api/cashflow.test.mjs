import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { ready } from "./helpers.mjs";

const today = new Date().toISOString().slice(0, 10);
const inAWeek = new Date(Date.parse(`${today}T12:00:00Z`) + 7 * 86_400_000)
  .toISOString()
  .slice(0, 10);

async function account(c, name = "Checking") {
  const created = await c.call("POST", "/api/accounts", {
    name,
    kind: "checking",
  });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  await c.call("PATCH", `/api/accounts/${created.json.account.id}`, {
    balance: "1000",
  });
  return created.json.account;
}

describe("cash flow", () => {
  test("projects scheduled items and keeps them private to an owned account", async () => {
    const owner = await ready();
    const other = await ready();
    const checking = await account(owner.c);
    const theirAccount = await account(other.c, "Other checking");
    const created = await owner.c.call("POST", "/api/cashflow", {
      name: "Payday",
      account: checking.id,
      direction: "income",
      amount: "500",
      cadence: "once",
      next_date: inAWeek,
    });
    assert.equal(created.status, 201, JSON.stringify(created.json));
    const forecast = await owner.c.call("GET", "/api/cashflow?days=30");
    assert.equal(forecast.status, 200, JSON.stringify(forecast.json));
    assert.equal(forecast.json.events.length, 1);
    assert.equal(forecast.json.events[0].running_cents, 150000);
    assert.equal(
      (await other.c.call("GET", "/api/cashflow")).json.items.length,
      0,
    );
    assert.equal(
      (
        await other.c.call("PATCH", `/api/cashflow/${created.json.item.id}`, {
          name: "Mine",
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await owner.c.call("POST", "/api/cashflow", {
          name: "Other",
          account: theirAccount.id,
          direction: "expense",
          amount: "20",
          cadence: "once",
          next_date: inAWeek,
        })
      ).status,
      400,
    );
    assert.equal(
      (await owner.c.call("GET", "/api/cashflow?days=45")).status,
      400,
    );
    assert.equal(
      (await owner.c.call("DELETE", `/api/cashflow/${created.json.item.id}`))
        .status,
      204,
    );
  });
});
