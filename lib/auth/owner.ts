import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { loadConfig, type AppConfig } from "@/lib/config";
import { readSession, type SessionPayload } from "@/lib/auth/session";

export const SESSION_COOKIE = "sl_session";

export type OwnerSession = {
  id: string;
  email: string;
  mode: AppConfig["mode"];
};

export async function readOwnerSession(): Promise<
  { ok: true; session: OwnerSession; config: AppConfig } | { ok: false; status: number; reason: string }
> {
  const config = loadConfig();
  if (!config.ok) {
    return { ok: false, status: 503, reason: config.reason };
  }
  const cookieStore = await cookies();
  if (config.mode === "supabase") {
    const supabase = createServerClient(config.supabaseUrl!, config.supabaseAnonKey!, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          for (const cookie of cookiesToSet) {
            cookieStore.set(cookie.name, cookie.value, cookie.options);
          }
        },
      },
    });
    const { data, error } = await supabase.auth.getUser();
    const email = data.user?.email?.toLowerCase();
    if (error || !email || email !== config.ownerEmail || data.user?.id !== config.ownerId) {
      return { ok: false, status: 401, reason: "Owner sign-in required." };
    }
    return { ok: true, config, session: { id: config.ownerId, email, mode: "supabase" } };
  }

  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const payload: SessionPayload | null = readSession(token, config.sessionSecret, config.mode);
  if (!payload || payload.sub !== config.ownerId || payload.email !== config.ownerEmail) {
    return { ok: false, status: 401, reason: "Owner sign-in required." };
  }
  return {
    ok: true,
    config,
    session: { id: payload.sub, email: payload.email, mode: config.mode },
  };
}

export async function requireOwner() {
  const result = await readOwnerSession();
  if (!result.ok) {
    const error = new Error(result.reason) as Error & { status: number };
    error.status = result.status;
    throw error;
  }
  return result;
}
