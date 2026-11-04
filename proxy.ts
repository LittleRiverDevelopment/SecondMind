import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { configuredMode } from "@/lib/config";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/login" || pathname === "/api/health") return NextResponse.next();
  const mode = configuredMode() || "demo";
  const signedIn =
    mode === "supabase"
      ? request.cookies.getAll().some((cookie) => cookie.name.startsWith("sb-"))
      : Boolean(request.cookies.get("sl_session")?.value);
  if (signedIn) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
