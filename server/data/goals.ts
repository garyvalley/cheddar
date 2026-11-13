import type { RecordModel } from "pocketbase";
import type { Goal, GoalFields } from "~~/shared/goals";
import { callerId, type Session } from "./session";

const toGoal = (r: RecordModel): Goal => ({
  id: r.id,
  name: r.name,
  target_cents: r.target_cents,
  saved_cents: r.saved_cents ?? 0,
  target_date: r.target_date ?? "",
  created: r.created,
});

export async function listGoals(s: Session): Promise<Goal[]> {
  return (
    await s.collection("goals").getFullList({ sort: "target_date,created" })
  ).map(toGoal);
}

export async function getGoal(s: Session, id: string): Promise<Goal> {
  return toGoal(await s.collection("goals").getOne(id));
}

export async function createGoal(
  s: Session,
  fields: GoalFields,
): Promise<Goal> {
  return toGoal(
    await s.collection("goals").create({ ...fields, owner: callerId(s) }),
  );
}

export async function updateGoal(
  s: Session,
  id: string,
  fields: GoalFields,
): Promise<Goal> {
  return toGoal(await s.collection("goals").update(id, fields));
}

export async function deleteGoal(s: Session, id: string): Promise<void> {
  await s.collection("goals").delete(id);
}
