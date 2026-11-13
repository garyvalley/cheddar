import type { RecordModel } from "pocketbase";
import type { CashflowFields, CashflowItem } from "~~/shared/cashflow";
import { callerId, type Session } from "./session";

const toItem = (r: RecordModel): CashflowItem => ({
  id: r.id,
  name: r.name,
  account: r.account,
  direction: r.direction,
  amount_cents: r.amount_cents,
  cadence: r.cadence,
  next_date: r.next_date,
  source_key: r.source_key ?? "",
});

export async function listCashflowItems(s: Session): Promise<CashflowItem[]> {
  return (
    await s.collection("cashflow_items").getFullList({ sort: "next_date,name" })
  ).map(toItem);
}

export async function getCashflowItem(
  s: Session,
  id: string,
): Promise<CashflowItem> {
  return toItem(await s.collection("cashflow_items").getOne(id));
}

export async function createCashflowItem(
  s: Session,
  fields: CashflowFields,
): Promise<CashflowItem> {
  return toItem(
    await s
      .collection("cashflow_items")
      .create({ ...fields, owner: callerId(s) }),
  );
}

export async function updateCashflowItem(
  s: Session,
  id: string,
  fields: CashflowFields,
): Promise<CashflowItem> {
  return toItem(await s.collection("cashflow_items").update(id, fields));
}

export async function deleteCashflowItem(
  s: Session,
  id: string,
): Promise<void> {
  await s.collection("cashflow_items").delete(id);
}
