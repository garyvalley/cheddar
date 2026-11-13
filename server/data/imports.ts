import { createHash } from "node:crypto";
import type { RecordModel } from "pocketbase";
import type { Import } from "~~/shared/accounts";
import { alreadySynced, around, type Dated } from "~~/shared/overlap";
import {
  dateRange,
  type StatementFormat,
  type StatementRow,
} from "~~/shared/statements";
import { callerId, type Session } from "./session";

/** Statement files imported into an account, and the transactions they add. */

export const toImport = (r: RecordModel): Import => ({
  id: r.id,
  account: r.account,
  filename: r.filename ?? "",
  format: r.format,
  added: r.added ?? 0,
  skipped: r.skipped ?? 0,
  first_date: r.first_date ?? "",
  last_date: r.last_date ?? "",
  created: r.created,
});

export async function listImports(
  s: Session,
  account?: string,
  ownedOnly = false,
): Promise<Import[]> {
  const parts: string[] = [];
  const params: Record<string, string> = {};
  if (account) {
    parts.push("account = {:account}");
    params.account = account;
  }
  if (ownedOnly) {
    parts.push("owner = {:owner}");
    params.owner = callerId(s);
  }
  return (
    await s.collection("imports").getFullList({
      sort: "-created",
      ...(parts.length ? { filter: s.filter(parts.join(" && "), params) } : {}),
    })
  ).map(toImport);
}

/** Undoes an import: its transactions go with it. */
export async function deleteImport(s: Session, id: string): Promise<void> {
  await s.collection("imports").delete(id);
}

/**
 * What identifies a file's row next time: the bank's own id when the file
 * has one, else a hash of what the row says. Two rows that say the same
 * thing on the same day (two coffees) are told apart by their order in the
 * file, so importing the same file, or one whose dates overlap it, adds
 * each of them once.
 */
export function externalIds(rows: StatementRow[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    if (r.fitid) return `fitid:${r.fitid}`;
    const key = `${r.posted}|${r.amount_cents}|${r.description.toLowerCase().replace(/\s+/g, " ").trim()}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    return `csv:${createHash("sha256").update(`${key}|${n}`).digest("hex").slice(0, 40)}`;
  });
}

const BATCH = 200; // migrations/0003: the batch API's maxRequests

/**
 * Adds a statement's rows to an account, skipping each one it already has:
 * the same file row from an earlier import, or the same transaction from the
 * account's bank link (shared/overlap.ts). Records the import. All or
 * nothing: if any write fails, the import is deleted, which takes whatever it
 * had added with it.
 */
export async function importRows(
  s: Session,
  account: string,
  file: { filename: string; format: StatementFormat; rows: StatementRow[] },
) {
  const owner = callerId(s);
  const ids = externalIds(file.rows);
  const range = dateRange(file.rows);
  const have = new Set<string>();
  let synced: Dated[] = [];
  if (range) {
    const span = around(range.first, range.last);
    const existing = await s.collection("transactions").getFullList({
      fields: "external_id,source,posted,amount_cents",
      filter: s.filter(
        "account = {:account} && posted >= {:from} && posted <= {:to}",
        { account, ...span },
      ),
    });
    for (const r of existing) have.add(r.external_id);
    synced = existing
      .filter((r) => r.source === "sync")
      .map((r) => ({ posted: r.posted, amount_cents: r.amount_cents }));
  }
  const candidates: { row: StatementRow; id: string }[] = [];
  file.rows.forEach((row, i) => {
    const id = ids[i]!;
    if (have.has(id)) return;
    have.add(id); // an OFX file that repeats an id
    candidates.push({ row, id });
  });
  const fromLink = alreadySynced(
    candidates.map((c) => c.row),
    synced,
  );
  const fresh = candidates.filter((_, i) => !fromLink[i]);

  const record = await s.collection("imports").create({
    owner,
    account,
    filename: file.filename.slice(0, 200),
    format: file.format,
    added: fresh.length,
    skipped: file.rows.length - fresh.length,
    first_date: range?.first ?? "",
    last_date: range?.last ?? "",
  });
  try {
    for (let i = 0; i < fresh.length; i += BATCH) {
      const batch = s.createBatch();
      for (const { row, id } of fresh.slice(i, i + BATCH)) {
        batch.collection("transactions").create({
          owner,
          account,
          import: record.id,
          source: "import",
          external_id: id,
          posted: row.posted,
          amount_cents: row.amount_cents,
          description: row.description,
        });
      }
      await batch.send();
    }
  } catch (error) {
    await s
      .collection("imports")
      .delete(record.id)
      .catch(() => {});
    throw error;
  }
  return toImport(record);
}
