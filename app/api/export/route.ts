import { readOwnerSession } from "@/lib/auth/owner";
import { getStore } from "@/lib/db";

export async function GET() {
  const auth = await readOwnerSession();
  if (!auth.ok) return Response.json({ error: "Unauthorized" }, { status: auth.status });
  const store = await getStore();
  const data = await store.exportData();
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": "attachment; filename=signal-library-export.json",
    },
  });
}
