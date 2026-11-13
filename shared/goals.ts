import { isDay, parseAmount } from "./transactions.ts";

export interface Goal {
  id: string;
  name: string;
  target_cents: number;
  saved_cents: number;
  target_date: string;
  created: string;
}

export interface GoalFields {
  name: string;
  target_cents: number;
  saved_cents: number;
  target_date: string;
}

export function checkGoal(
  input: Record<string, unknown>,
): { ok: GoalFields } | { problem: string } {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 60)
    return { problem: "Give the goal a name of up to 60 characters." };
  const target = parseAmount(input.target);
  if (!target || target.negative || !target.cents)
    return { problem: "Enter a target greater than zero." };
  const saved = parseAmount(input.saved ?? "0");
  if (!saved || saved.negative || saved.cents > target.cents)
    return { problem: "Enter an amount saved between zero and the target." };
  const targetDate =
    typeof input.target_date === "string" ? input.target_date.trim() : "";
  if (targetDate && !isDay(targetDate))
    return { problem: "Choose a real target date." };
  return {
    ok: {
      name,
      target_cents: target.cents,
      saved_cents: saved.cents,
      target_date: targetDate,
    },
  };
}

export function monthlyGoalAmount(
  goal: Pick<Goal, "target_cents" | "saved_cents" | "target_date">,
  today: string,
): number | null {
  const remaining = goal.target_cents - goal.saved_cents;
  if (!goal.target_date || remaining <= 0) return null;
  const now = new Date(`${today}T12:00:00Z`);
  const due = new Date(`${goal.target_date}T12:00:00Z`);
  const months = Math.max(
    1,
    (due.getUTCFullYear() - now.getUTCFullYear()) * 12 +
      due.getUTCMonth() -
      now.getUTCMonth() +
      (due.getUTCDate() > now.getUTCDate() ? 1 : 0),
  );
  return Math.ceil(remaining / months);
}
