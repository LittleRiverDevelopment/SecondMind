import { createHmac, timingSafeEqual } from "node:crypto";
import type { AppMode } from "@/lib/config";

export type SessionPayload = {
  sub: string;
  email: string;
  mode: Exclude<AppMode, "supabase"> | "supabase";
  exp: number;
};

function encode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(body: string, secret: string) {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function issueSession(payload: Omit<SessionPayload, "exp">, secret: string, ttlSeconds = 60 * 60 * 24 * 14) {
  const full: SessionPayload = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const body = encode(JSON.stringify(full));
  return `${body}.${sign(body, secret)}`;
}

export function readSession(token: string | undefined, secret: string, expectedMode: AppMode): SessionPayload | null {
  if (!token || !secret) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = sign(body, secret);
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(decode(body)) as SessionPayload;
    if (!payload.sub || !payload.email || !payload.exp || !payload.mode) return null;
    if (payload.mode !== expectedMode) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function passwordsMatch(provided: string, expected: string) {
  const left = Buffer.from(createHmac("sha256", "signal-library-password").update(provided).digest());
  const right = Buffer.from(createHmac("sha256", "signal-library-password").update(expected).digest());
  return timingSafeEqual(left, right);
}
