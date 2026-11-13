// Transactions a person searches, adds by hand, changes and leaves out, end
// to end through nginx and Nuxt against a real PocketBase: a search finds
// words and an amount's size on any date, one added by hand is sorted like
// any other, one from a statement keeps its bank's date and amount, one
// left out stops counting everywhere but stays listed, and nobody can do
// any of it to someone else's.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { PB, ready } from "./helpers.mjs";

const today = new Date().toISOString().slice(0, 10);
const year = today.slice(0, 4);
const month = today.slice(0, 7);
const us = (ymd) => `${ymd.slice(5, 7)}/${ymd.slice(8, 10)}/${ymd.slice(0, 4)}`;
const jan = (day) => `${year}-01-${String(day).padStart(2, "0")}`;

async function account(c, body = { name: "Everyday", kind: "checking" }) {
  const r = await c.call("POST", "/api/accounts", body);
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.json.account;
}

async function imported(c, accountId, rows) {
  const text = `Date,Description,Amount\n${rows.map((r) => r.join(",")).join("\n")}\n`;
  const r = await c.call("POST", "/api/imports", {
    account: accountId,
    filename: "statement.csv",
    text,
  });
  assert.equal(r.status, 201, JSON.stringify(r.json));
}

const list = async (c, query = "") =>
  (await c.call("GET", `/api/transactions?${query}`)).json;
const byDescription = async (c, description) =>
  (await list(c, `q=${encodeURIComponent(description)}`)).items.find(
    (t) => t.description === description,
  );

describe("searching transactions", () => {
  test("finds words in the description, the name or the note, on any date, any case", async () => {
    const { c } = await ready();
    const a = await account(c);
    await imported(c, a.id, [
      [us(`${Number(year) - 1}-03-14`), "AMAZON MKTP US*2K4", "-79.99"],
      [us(jan(2)), "Amazon.com refund", "12.00"],
      [us(jan(3)), "COSTCO WHSE #123", "-210.40"],
    ]);
    const costco = await byDescription(c, "COSTCO WHSE #123");
    assert.equal(
      (
        await c.call("PATCH", `/api/transactions/${costco.id}`, {
          note: "Half groceries, half for the garage",
        })
      ).status,
      200,
    );

    assert.deepEqual(
      (await list(c, "q=amazon")).items.map((t) => t.description),
      ["Amazon.com refund", "AMAZON MKTP US*2K4"],
    );
    assert.deepEqual(
      (await list(c, "q=garage")).items.map((t) => t.description),
      ["COSTCO WHSE #123"],
    );
    assert.equal((await list(c, "q=nothing+like+it")).total, 0);
  });

  test("finds an amount by its size, money in or out", async () => {
    const { c } = await ready();
    const a = await account(c);
    await imported(c, a.id, [
      [us(jan(2)), "AMAZON", "-79.99"],
      [us(jan(3)), "REFUND", "80.00"],
      [us(jan(4)), "COFFEE", "-4.50"],
    ]);
    assert.deepEqual(
      (await list(c, "min=75&max=85")).items.map((t) => t.amount_cents),
      [8000, -7999],
    );
    assert.deepEqual(
      (await list(c, "q=amazon&min=75&max=85")).items.map(
        (t) => t.amount_cents,
      ),
      [-7999],
    );
    assert.deepEqual(
      (await list(c, "max=5")).items.map((t) => t.amount_cents),
      [-450],
    );
    assert.deepEqual(
      (await list(c, "min=80")).items.map((t) => t.amount_cents),
      [8000],
    );
    const bad = await c.call("GET", "/api/transactions?min=lots");
    assert.equal(bad.status, 400);
    assert.match(bad.json.message, /amount/);
  });

  test("the download finds the same", async () => {
    const { c } = await ready();
    const a = await account(c);
    await imported(c, a.id, [
      [us(jan(2)), "AMAZON", "-79.99"],
      [us(jan(4)), "COFFEE", "-4.50"],
    ]);
    const csv = (await c.call("GET", "/api/transactions/csv?q=coffee")).json;
    assert.equal(csv.trim().split("\r\n").length, 2, csv);
    assert.match(csv, /COFFEE/);
  });
});

describe("a transaction added by hand", () => {
  test("is added, sorted into a category, and counts like any other", async () => {
    const { c } = await ready();
    const a = await account(c, { name: "Wallet", kind: "other" });
    const r = await c.call("POST", "/api/transactions", {
      account: a.id,
      posted: today,
      amount: "12.40",
      direction: "out",
      description: "Starbucks",
      note: "Cash",
    });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.deepEqual(
      [
        r.json.transaction.posted,
        r.json.transaction.amount_cents,
        r.json.transaction.description,
        r.json.transaction.note,
        r.json.transaction.source,
        r.json.transaction.excluded,
      ],
      [today, -1240, "Starbucks", "Cash", "manual", false],
    );
    const saved = (await list(c, `account=${a.id}`)).items[0];
    assert.equal(saved.category, "dining", "the hooks sorted it");
    const spent = (await c.call("GET", `/api/spending?at=${month}`)).json;
    assert.equal(spent.spent_cents, 1240);
  });

  test("can change entirely, and be deleted", async () => {
    const { c } = await ready();
    const a = await account(c, { name: "Wallet", kind: "other" });
    const {
      json: { transaction: t },
    } = await c.call("POST", "/api/transactions", {
      account: a.id,
      posted: today,
      amount: "5",
      direction: "out",
      description: "Lunch",
    });
    const r = await c.call("PATCH", `/api/transactions/${t.id}`, {
      posted: jan(5),
      amount: "250",
      direction: "in",
      description: "Sold the old bike",
      payee: "Neighbor",
    });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.deepEqual(
      [
        r.json.transaction.posted,
        r.json.transaction.amount_cents,
        r.json.transaction.description,
        r.json.transaction.payee,
      ],
      [jan(5), 25000, "Sold the old bike", "Neighbor"],
    );
    assert.equal(
      (await c.call("DELETE", `/api/transactions/${t.id}`)).status,
      204,
    );
    assert.equal((await list(c, `account=${a.id}`)).total, 0);
  });

  test("needs a day, an amount, which way it went and what it was", async () => {
    const { c } = await ready();
    const a = await account(c);
    const post = (body) =>
      c.call("POST", "/api/transactions", {
        account: a.id,
        posted: today,
        amount: "5",
        direction: "out",
        description: "Lunch",
        ...body,
      });
    assert.match((await post({ posted: "2026-02-30" })).json.message, /day/);
    assert.match((await post({ amount: "five" })).json.message, /amount/);
    assert.match(
      (await post({ direction: undefined })).json.message,
      /out or came in/,
    );
    assert.match((await post({ description: "" })).json.message, /what it was/);
    assert.equal((await list(c)).total, 0);
  });

  test("can't go into someone else's account, nor be seen, changed or deleted by them", async () => {
    const owner = await ready();
    const other = await ready();
    const a = await account(owner.c);
    const theirs = await other.c.call("POST", "/api/transactions", {
      account: a.id,
      posted: today,
      amount: "5",
      direction: "out",
      description: "Sneaky",
    });
    assert.equal(theirs.status, 404);
    const {
      json: { transaction: t },
    } = await owner.c.call("POST", "/api/transactions", {
      account: a.id,
      posted: today,
      amount: "5",
      direction: "out",
      description: "Lunch",
    });
    assert.equal(
      (
        await other.c.call("PATCH", `/api/transactions/${t.id}`, {
          note: "mine now",
          excluded: true,
        })
      ).status,
      404,
    );
    assert.equal(
      (await other.c.call("DELETE", `/api/transactions/${t.id}`)).status,
      404,
    );
    assert.equal(
      (await other.c.call("GET", "/api/transactions?q=lunch")).json.total,
      0,
    );
    const still = (await list(owner.c)).items[0];
    assert.deepEqual(
      [still.note, still.excluded, still.description],
      ["", false, "Lunch"],
    );
  });
});

describe("a transaction from a statement", () => {
  test("takes a name, a note and being left out, but keeps its date, amount and description", async () => {
    const { c } = await ready();
    const a = await account(c);
    await imported(c, a.id, [[us(today), "SQ *BLUE BOTTLE 0042", "-6.25"]]);
    const t = (await list(c)).items[0];
    const named = await c.call("PATCH", `/api/transactions/${t.id}`, {
      payee: "Blue Bottle",
      note: "With Sam",
    });
    assert.equal(named.status, 200, JSON.stringify(named.json));
    assert.deepEqual(
      [
        named.json.transaction.payee,
        named.json.transaction.note,
        named.json.transaction.description,
      ],
      ["Blue Bottle", "With Sam", "SQ *BLUE BOTTLE 0042"],
    );
    for (const change of [
      { amount: "1", direction: "out" },
      { posted: jan(1) },
      { description: "other" },
    ]) {
      const r = await c.call("PATCH", `/api/transactions/${t.id}`, change);
      assert.equal(r.status, 400, JSON.stringify(change));
      assert.match(r.json.message, /bank or statement/);
    }
    const r = await c.call("DELETE", `/api/transactions/${t.id}`);
    assert.equal(r.status, 400);
    assert.match(r.json.message, /undo that import/);
    assert.equal((await list(c)).items[0].amount_cents, -625);
  });

  test("nothing else rides along with a change: not its account, owner, category or source", async () => {
    const owner = await ready();
    const other = await ready();
    const mine = await account(owner.c);
    const theirs = await account(other.c, { name: "Theirs", kind: "checking" });
    await imported(owner.c, mine.id, [[us(today), "COFFEE", "-4.50"]]);
    const t = (await list(owner.c)).items[0];
    const r = await owner.c.call("PATCH", `/api/transactions/${t.id}`, {
      note: "ok",
      account: theirs.id,
      owner: other.id,
      category: "income",
      category_by: "person",
      source: "manual",
      amount_cents: 1,
    });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const after = (await list(owner.c)).items[0];
    assert.deepEqual(
      [
        after.account,
        after.category,
        after.source,
        after.amount_cents,
        after.note,
      ],
      [mine.id, t.category, "import", -450, "ok"],
    );
    assert.equal((await list(other.c)).total, 0);
  });
});

describe("reviewing transactions", () => {
  test("lists new rows, marks selected rows reviewed, and keeps the queue owner-only", async () => {
    const owner = await ready();
    const other = await ready();
    const a = await account(owner.c);
    await imported(owner.c, a.id, [
      [us(today), "COFFEE", "-4.50"],
      [us(today), "MARKET", "-12.00"],
    ]);
    const waiting = await list(owner.c, "reviewed=false");
    assert.equal(waiting.total, 2);
    assert.ok(waiting.items.every((t) => !t.reviewed));
    assert.equal(
      (
        await owner.c.call("POST", "/api/transactions/review", {
          ids: [waiting.items[0].id],
          reviewed: true,
        })
      ).json.updated,
      1,
    );
    assert.equal((await list(owner.c, "reviewed=false")).total, 1);
    assert.equal((await list(owner.c, "reviewed=true")).total, 1);
    assert.equal(
      (
        await other.c.call("POST", "/api/transactions/review", {
          ids: [waiting.items[1].id],
          reviewed: true,
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await owner.c.call("POST", "/api/transactions/review", {
          ids: [],
          reviewed: true,
        })
      ).status,
      400,
    );
    assert.equal(
      (await owner.c.call("GET", "/api/transactions?reviewed=maybe")).status,
      400,
    );
  });
});

describe("leaving a transaction out", () => {
  test("takes it out of spending, recurring, Overview, Projections and Taxes, but keeps it listed", async () => {
    const { c } = await ready();
    const chk = await account(c, { name: "Checking", kind: "checking" });
    await imported(c, chk.id, [
      [us(today), "PAYROLL ACME", "1000.00"],
      [us(today), "CVS PHARMACY", "-40.00"],
      [us(today), "WORK FLIGHT DELTA", "-300.00"],
    ]);
    const before = (await c.call("GET", `/api/spending?at=${month}`)).json;
    const overviewBefore = (
      await c.call("GET", "/api/overview")
    ).json.months.at(-1);
    const taxesBefore = (await c.call("GET", "/api/taxes")).json;

    const flight = await byDescription(c, "WORK FLIGHT DELTA");
    const pay = await byDescription(c, "PAYROLL ACME");
    const cvs = await byDescription(c, "CVS PHARMACY");
    for (const t of [flight, pay, cvs]) {
      const r = await c.call("PATCH", `/api/transactions/${t.id}`, {
        excluded: true,
      });
      assert.equal(r.status, 200, JSON.stringify(r.json));
      assert.equal(r.json.transaction.excluded, true);
    }

    const after = (await c.call("GET", `/api/spending?at=${month}`)).json;
    assert.equal(before.spent_cents - after.spent_cents, 34000);
    assert.equal(after.spent_cents, 0);
    const overviewAfter = (await c.call("GET", "/api/overview")).json.months.at(
      -1,
    );
    assert.equal(overviewBefore.spent_cents - overviewAfter.spent_cents, 34000);
    assert.equal(
      overviewBefore.income_cents - overviewAfter.income_cents,
      100000,
    );
    const taxesAfter = (await c.call("GET", "/api/taxes")).json;
    assert.equal(taxesBefore.income_cents - taxesAfter.income_cents, 100000);
    assert.equal(taxesBefore.health_cents - taxesAfter.health_cents, 4000);

    const listed = await list(c, `account=${chk.id}`);
    assert.equal(listed.total, 3, "still listed");
    assert.ok(listed.items.every((t) => t.excluded));

    // Back in, it counts again.
    await c.call("PATCH", `/api/transactions/${flight.id}`, {
      excluded: false,
    });
    assert.equal(
      (await c.call("GET", `/api/spending?at=${month}`)).json.spent_cents,
      30000,
    );
  });

  test("the store keeps the flag a boolean, the person's own", async () => {
    const { c } = await ready();
    const a = await account(c);
    await imported(c, a.id, [[us(today), "COFFEE", "-4.50"]]);
    const t = (await list(c)).items[0];
    assert.equal(
      (await c.call("PATCH", `/api/transactions/${t.id}`, { excluded: "yes" }))
        .status,
      400,
    );
    assert.equal(
      (await c.call("PATCH", `/api/transactions/${t.id}`, {})).status,
      400,
    );
    // Straight to PocketBase with the person's own token, the rules still keep it to their row.
    const token = decodeURIComponent(c.cookie.slice("pb_token=".length));
    const r = await fetch(
      `${PB}/api/collections/transactions/records/${t.id}`,
      { headers: { authorization: token } },
    );
    assert.equal((await r.json()).excluded, false);
  });
});
