import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { cashflowForecast, checkCashflowItem } from "../shared/cashflow.ts";

const account = {
  id: "acct",
  name: "Checking",
  kind: "checking",
  institution: "",
  last4: "",
  currency: "USD",
  source: "manual",
  balance_cents: 100000,
  balance_date: "2026-11-13",
  linked: false,
  closed_on: "",
  excluded: false,
};

describe("cash flow", () => {
  test("expands schedules and detected charges without double counting an adopted charge", () => {
    const items = [
      {
        id: "rent",
        name: "Rent",
        account: "acct",
        direction: "expense",
        amount_cents: 50000,
        cadence: "monthly",
        next_date: "2026-11-20",
        source_key: "rent",
      },
    ];
    const detected = [
      {
        key: "rent",
        name: "Rent",
        account: "acct",
        cadence: "monthly",
        amount_cents: 50000,
        next: "2026-11-20",
        stopped: false,
      },
      {
        key: "music",
        name: "Music",
        account: "acct",
        cadence: "monthly",
        amount_cents: 1000,
        next: "2026-11-25",
        stopped: false,
      },
    ];
    const result = cashflowForecast(
      [account],
      items,
      detected,
      "2026-11-13",
      30,
    );
    assert.deepEqual(
      result.events.map((event) => [
        event.name,
        event.amount_cents,
        event.running_cents,
      ]),
      [
        ["Rent", -50000, 50000],
        ["Music", -1000, 49000],
      ],
    );
    assert.equal(result.accounts[0].projected_cents, 49000);
  });

  test("requires a valid counted account and schedule", () => {
    const input = {
      name: "Payday",
      account: "acct",
      direction: "income",
      amount: "2500",
      cadence: "biweekly",
      next_date: "2026-11-20",
    };
    assert.equal(
      checkCashflowItem(input, [account], "2026-11-13").ok.amount_cents,
      250000,
    );
    assert.ok(
      "problem" in
        checkCashflowItem(
          { ...input, account: "other" },
          [account],
          "2026-11-13",
        ),
    );
    assert.ok(
      "problem" in
        checkCashflowItem({ ...input, amount: "0" }, [account], "2026-11-13"),
    );
  });
});
