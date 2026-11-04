import { configuredMode, onRenderHost } from "@/lib/config";

export function GET() {
  const mode = configuredMode();
  return Response.json({ ok: Boolean(mode), mode: mode || "unset", render: onRenderHost() });
}
