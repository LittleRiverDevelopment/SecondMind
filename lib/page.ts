import { redirect } from "next/navigation";
import { connection } from "next/server";
import { readOwnerSession } from "@/lib/auth/owner";
import { getStore } from "@/lib/db";

export async function pageContext() {
  await connection();
  const auth = await readOwnerSession();
  if (!auth.ok) redirect("/login");
  const store = await getStore();
  return { ...auth, store };
}

export function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date);
}
