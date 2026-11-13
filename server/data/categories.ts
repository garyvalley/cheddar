import type { Category } from "~~/shared/categories";
import type { Session } from "./session";

/**
 * The person's categories, built in and their own: the routes in
 * pb_hooks/categories.pb.js, which alone read and write their own ones.
 */
export async function listCategories(s: Session): Promise<Category[]> {
  return (await s.send("/api/categories", { method: "GET" })).categories;
}

export async function createCategory(
  s: Session,
  name: string,
): Promise<Category> {
  return (await s.send("/api/categories", { method: "POST", body: { name } }))
    .category;
}

export async function renameCategory(
  s: Session,
  id: string,
  name: string,
): Promise<Category> {
  return (
    await s.send(`/api/categories/${encodeURIComponent(id)}/rename`, {
      method: "POST",
      body: { name },
    })
  ).category;
}

/** Deletes one of the person's own categories; its transactions are sorted again on their own. */
export async function removeCategory(
  s: Session,
  id: string,
): Promise<{ resorted: number }> {
  return await s.send(`/api/categories/${encodeURIComponent(id)}/remove`, {
    method: "POST",
  });
}
