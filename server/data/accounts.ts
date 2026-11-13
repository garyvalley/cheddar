import type { RecordModel } from "pocketbase";
import type { Account, AccountChange, NewAccount } from "~~/shared/accounts";
import { callerId, type Session } from "./session";

/**
 * Accounts, always as the signed-in person: PocketBase's rules
 * (migrations/0003_accounts_and_transactions.mjs, 0020_household_sharing.mjs)
 * keep each person's to them and the households they share with.
 */

export const toAccount = (r: RecordModel, person: string): Account => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  institution: r.institution ?? "",
  last4: r.last4 ?? "",
  currency: r.currency || "USD",
  source: r.source ?? "",
  balance_cents: r.balance_date ? (r.balance_cents ?? 0) : null,
  balance_date: r.balance_date ?? "",
  linked: !!r.link,
  closed_on: r.closed_on ?? "",
  excluded: !!r.excluded,
  owned: r.owner === person,
  shared: r.owner !== person,
  shared_with_household: !!r.shared_household,
});

export async function listAccounts(
  s: Session,
  ownedOnly = false,
): Promise<Account[]> {
  const person = callerId(s);
  return (
    await s.collection("accounts").getFullList({
      sort: "name,created",
      ...(ownedOnly
        ? { filter: s.filter("owner = {:owner}", { owner: person }) }
        : {}),
    })
  ).map((r) => toAccount(r, person));
}

/** One of the caller's accounts; a 404 from the store for anyone else's. */
export async function getAccount(s: Session, id: string): Promise<Account> {
  return toAccount(await s.collection("accounts").getOne(id), callerId(s));
}

export async function createAccount(
  s: Session,
  a: NewAccount,
): Promise<Account> {
  return toAccount(
    await s.collection("accounts").create({
      ...a,
      owner: callerId(s),
      currency: "USD",
      source: "manual",
    }),
    callerId(s),
  );
}

/**
 * Sets the balance of an account no bank link keeps up to date, as of `date`
 * (today for one entered by hand, a statement's closing day for one read from
 * it); pb_hooks/balances.pb.js adds it to the account's history.
 */
export async function setBalance(
  s: Session,
  id: string,
  cents: number,
  date: string,
): Promise<Account> {
  return toAccount(
    await s
      .collection("accounts")
      .update(id, { balance_cents: cents, balance_date: date }),
    callerId(s),
  );
}

/**
 * Changes what the person may change about an account (checkAccountChange()),
 * and with `balance_cents` its balance too, as setBalance() does.
 */
export async function updateAccount(
  s: Session,
  id: string,
  change: AccountChange & { balance_cents?: number; balance_date?: string },
): Promise<Account> {
  return toAccount(
    await s.collection("accounts").update(id, change),
    callerId(s),
  );
}

/** Deletes the account with every transaction and import in it. */
export async function deleteAccount(s: Session, id: string): Promise<void> {
  await s.collection("accounts").delete(id);
}

/**
 * What every page counts leaves out the accounts the person excluded: this
 * filter, on a transaction query, and `counted()` on a list of accounts.
 * Closed accounts still count, for the time they were open (asHeld()).
 */
export const COUNTED = "account.excluded = false";
/**
 * And the transactions the person left out one by one: they're listed, but
 * no total counts them.
 */
export const TX_COUNTED = "excluded = false";
export const counted = async (s: Session) =>
  (await listAccounts(s)).filter((a) => !a.excluded);
