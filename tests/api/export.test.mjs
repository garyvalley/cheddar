// Exporting your data end to end: Settings' zip asks for the password and
// holds everything the person has, and nobody else's; Spending's CSV is the
// transactions it shows. Neither ever carries a bank token or a two-step secret.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { APP, PASSWORD, client, ready, signedIn } from "./helpers.mjs";
import { unzip } from "../unzip.mjs";

const CSV =
  "Transaction Date,Description,Amount\n" +
  "11/01/2026,COFFEE,-4.50\n" +
  '11/02/2026,"GROCERY, INC",-82.10\n' +
  "10/03/2026,PAYCHECK,2500.00\n" +
  '10/04/2026,"=HYPERLINK(""http://evil"")",-1.00\n';

async function withData(c, name = "Everyday") {
  const a = (await c.call("POST", "/api/accounts", { name, kind: "checking" }))
    .json.account;
  const r = await c.call("POST", "/api/imports", {
    account: a.id,
    filename: "nov.csv",
    text: CSV,
  });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.equal(
    (await c.call("PATCH", `/api/accounts/${a.id}`, { balance: "1234.56" }))
      .status,
    200,
  );
  return a;
}

/** The raw answer: a zip isn't text. */
const post = (c, path, body) =>
  fetch(`${APP}${path}`, {
    method: "POST",
    headers: {
      origin: APP,
      "content-type": "application/json",
      cookie: c.cookie,
      "x-forwarded-for": c.from,
    },
    body: JSON.stringify(body),
  });

describe("exporting everything", () => {
  test("is a zip of three spreadsheets and cheddar.json, with nothing secret in it", async () => {
    const me = await ready();
    const other = await ready();
    await withData(me.c);
    await withData(other.c, "Not mine");
    const r = await post(me.c, "/api/export", { password: PASSWORD });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "application/zip");
    assert.match(
      r.headers.get("content-disposition"),
      /^attachment; filename="cheddar-export-\d{4}-\d{2}-\d{2}\.zip"$/,
    );
    assert.match(r.headers.get("cache-control"), /no-store/);
    const files = unzip(Buffer.from(await r.arrayBuffer()));
    assert.deepEqual(Object.keys(files).sort(), [
      "accounts.csv",
      "balance_history.csv",
      "cheddar.json",
      "transactions.csv",
    ]);

    const data = JSON.parse(files["cheddar.json"]);
    assert.equal(data.profile.email, me.address);
    assert.deepEqual(
      data.accounts.map((a) => a.name),
      ["Everyday"],
    );
    assert.equal(data.transactions.length, 4);
    assert.ok(
      data.transactions.every((t) => t.import),
      "each row names its import",
    );
    assert.equal(data.imports.length, 1);
    assert.deepEqual(data.cashflow_items, []);
    assert.ok(data.balance_history.some((p) => p.balance_cents === 123456));
    assert.ok(
      Array.isArray(data.category_rules) && Array.isArray(data.categories),
    );
    const all = JSON.stringify(files);
    assert.doesNotMatch(all, /Not mine/);
    assert.ok(!all.includes(me.secret), "no two-step secret");
    assert.doesNotMatch(all, /access_token|recovery|totp|password/i);

    const tx = files["transactions.csv"].split("\r\n");
    assert.equal(
      tx[0],
      "﻿Date,Account,Amount,Description,Payee,Category,Pending,Note,Left out,Split",
    );
    assert.ok(
      tx.includes(
        '2026-11-02,Everyday,-82.1,"GROCERY, INC",,Groceries,no,,no,',
      ),
      tx.join("\n"),
    );
    // A description a spreadsheet would run as a formula is text.
    assert.ok(
      tx.some((l) => l.includes('"\'=HYPERLINK(""http://evil"")"')),
      tx.join("\n"),
    );
  });

  test("asks for the right password", async () => {
    const { c } = await ready();
    const wrong = await c.call("POST", "/api/export", {
      password: "wrong password!",
    });
    assert.equal(wrong.status, 400);
    assert.match(wrong.json.message, /password/);
    assert.equal((await c.call("POST", "/api/export", {})).status, 400);
  });

  test("needs two-step sign-in, a session, and this site", async () => {
    const { c } = await signedIn();
    assert.equal(
      (await c.call("POST", "/api/export", { password: PASSWORD })).status,
      403,
    );
    assert.equal(
      (await client().call("POST", "/api/export", { password: PASSWORD }))
        .status,
      401,
    );
    const me = await ready();
    assert.equal(
      (
        await me.c.call(
          "POST",
          "/api/export",
          { password: PASSWORD },
          { origin: "https://evil.example" },
        )
      ).status,
      403,
    );
  });

  test("counts toward the password limit", async () => {
    const { c } = await ready();
    const statuses = [];
    for (let i = 0; i < 8; i++)
      statuses.push(
        (await c.call("POST", "/api/export", { password: "wrong password!" }))
          .status,
      );
    assert.deepEqual(statuses.slice(-2), [429, 429]);
  });
});

describe("Spending's CSV", () => {
  test("is the transactions for the period, account and category shown, oldest first", async () => {
    const { c } = await ready();
    const a = await withData(c);
    const r = await c.call(
      "GET",
      `/api/transactions/csv?from=2026-11-01&to=2026-11-30&account=${a.id}`,
    );
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type"), /^text\/csv/);
    assert.equal(
      r.headers.get("content-disposition"),
      'attachment; filename="cheddar-transactions-2026-11-01-to-2026-11-30.csv"',
    );
    const lines = r.json.split("\r\n").filter(Boolean);
    assert.equal(lines.length, 3);
    assert.match(lines[1], /^2026-11-01,Everyday,-4.5,COFFEE,/);
    assert.match(lines[2], /^2026-11-02,/);
    const groceries = (
      await c.call("GET", "/api/transactions/csv?category=groceries")
    ).json
      .split("\r\n")
      .filter(Boolean);
    assert.equal(groceries.length, 2);
  });

  test("shows nobody else's, and refuses a bad filter", async () => {
    const owner = await ready();
    const other = await ready();
    const a = await withData(owner.c);
    assert.equal(
      (await other.c.call("GET", `/api/transactions/csv?account=${a.id}`)).json
        .split("\r\n")
        .filter(Boolean).length,
      1,
    );
    assert.equal(
      (await other.c.call("GET", "/api/transactions/csv?from=yesterday"))
        .status,
      400,
    );
    assert.equal(
      (await client().call("GET", "/api/transactions/csv")).status,
      401,
    );
  });
});
