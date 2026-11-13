import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { ready } from "./helpers.mjs";

describe("savings goals", () => {
  test("are private, editable, and separate from account totals", async () => {
    const owner = await ready();
    const other = await ready();
    const before = (await owner.c.call("GET", "/api/overview")).json.net_worth
      .total_cents;
    const created = await owner.c.call("POST", "/api/goals", {
      name: "Emergency fund",
      target: "5000",
      saved: "1250",
      target_date: "2027-11-13",
    });
    assert.equal(created.status, 201, JSON.stringify(created.json));
    const goal = created.json.goal;
    assert.deepEqual(
      [goal.name, goal.target_cents, goal.saved_cents],
      ["Emergency fund", 500000, 125000],
    );
    assert.equal(
      (await other.c.call("GET", "/api/goals")).json.goals.length,
      0,
    );
    assert.equal(
      (await other.c.call("PATCH", `/api/goals/${goal.id}`, { saved: "2000" }))
        .status,
      404,
    );
    assert.equal(
      (await owner.c.call("PATCH", `/api/goals/${goal.id}`, { saved: "2000" }))
        .json.goal.saved_cents,
      200000,
    );
    assert.equal(
      (await owner.c.call("GET", "/api/overview")).json.net_worth.total_cents,
      before,
    );
    assert.equal(
      (await owner.c.call("DELETE", `/api/goals/${goal.id}`)).status,
      204,
    );
    assert.equal(
      (
        await owner.c.call("POST", "/api/goals", {
          name: "No target",
          target: "0",
        })
      ).status,
      400,
    );
  });
});
