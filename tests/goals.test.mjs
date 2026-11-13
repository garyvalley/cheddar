import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { checkGoal, monthlyGoalAmount } from "../shared/goals.ts";

describe("savings goals", () => {
  test("validates names, amounts, and optional dates", () => {
    assert.deepEqual(
      checkGoal({
        name: " Emergency fund ",
        target: "5,000",
        saved: "250",
        target_date: "2027-11-13",
      }).ok,
      {
        name: "Emergency fund",
        target_cents: 500000,
        saved_cents: 25000,
        target_date: "2027-11-13",
      },
    );
    for (const bad of [
      { name: "", target: "100" },
      { name: "Car", target: "-1" },
      { name: "Car", target: "100", saved: "101" },
      { name: "Car", target: "100", target_date: "2026-02-30" },
    ])
      assert.ok("problem" in checkGoal(bad), JSON.stringify(bad));
  });

  test("suggests a monthly amount only when there is a target date", () => {
    assert.equal(
      monthlyGoalAmount(
        { target_cents: 120000, saved_cents: 0, target_date: "2027-11-13" },
        "2026-11-13",
      ),
      10000,
    );
    assert.equal(
      monthlyGoalAmount(
        { target_cents: 120000, saved_cents: 0, target_date: "" },
        "2026-11-13",
      ),
      null,
    );
    assert.equal(
      monthlyGoalAmount(
        {
          target_cents: 120000,
          saved_cents: 120000,
          target_date: "2027-11-13",
        },
        "2026-11-13",
      ),
      null,
    );
  });
});
