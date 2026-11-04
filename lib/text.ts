import { createHash } from "node:crypto";

export function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function contentHash(value: string) {
  const normalized = collapseWhitespace(value);
  if (!normalized) return null;
  return createHash("sha256").update(normalized).digest("hex");
}

export function exactUrlKey(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function domainOf(value: string | null) {
  if (!value) return null;
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

export function preview(value: string | null | undefined, length = 180) {
  const text = collapseWhitespace(value ?? "");
  if (text.length <= length) return text;
  return `${text.slice(0, length - 1).trimEnd()}…`;
}

export function parseTopicList(value: string) {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const part of value.split(",")) {
    const name = part.trim().replace(/\s+/g, " ");
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
    if (names.length >= 10) break;
  }
  return names;
}

export function isoDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function asObject<T>(value: unknown, fallback: T): T {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  if (value == null) return fallback;
  return value as T;
}
