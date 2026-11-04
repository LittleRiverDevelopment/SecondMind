import { describe, expect, it } from "vitest";
import { DEMO_SESSION_SECRET, loadConfig } from "@/lib/config";
import { issueSession, passwordsMatch, readSession } from "@/lib/auth/session";
import { captureSchema } from "@/lib/validation";

describe("configuration", () => {
  it("fails closed in production when APP_MODE is missing", () => {
    const result = loadConfig({ NODE_ENV: "production" });
    expect(result.ok).toBe(false);
  });

  it("uses demo mode on Render when no mode or database is set", () => {
    const result = loadConfig({ NODE_ENV: "production", RENDER: "true" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mode).toBe("demo");
      expect(result.ai).toBe("mock");
    }
  });

  it("does not open a database URL just because the host is Render", () => {
    const result = loadConfig({ NODE_ENV: "production", RENDER: "true", DATABASE_URL: "postgres://example" });
    expect(result.ok).toBe(false);
  });

  it("refuses demo mode when a database URL is set", () => {
    const result = loadConfig({ NODE_ENV: "production", APP_MODE: "demo", DATABASE_URL: "postgres://example" });
    expect(result.ok).toBe(false);
  });

  it("requires the local owner settings", () => {
    const result = loadConfig({ NODE_ENV: "production", APP_MODE: "local" });
    expect(result.ok).toBe(false);
  });

  it("accepts a complete local configuration and does not default it to mock silently", () => {
    const result = loadConfig({
      NODE_ENV: "production",
      APP_MODE: "local",
      OWNER_ID: "00000000-0000-4000-8000-0000000000aa",
      OWNER_EMAIL: "owner@example.com",
      OWNER_PASSWORD: "long-password",
      SESSION_SECRET: "0123456789abcdef",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.ai).toBe("unconfigured");
  });
});

describe("sessions", () => {
  it("rejects a demo cookie in local mode", () => {
    const token = issueSession(
      { sub: "00000000-0000-4000-8000-000000000001", email: "demo-owner@signal-library.local", mode: "demo" },
      DEMO_SESSION_SECRET,
    );
    expect(readSession(token, DEMO_SESSION_SECRET, "local")).toBeNull();
    expect(readSession(token, DEMO_SESSION_SECRET, "demo")?.mode).toBe("demo");
  });

  it("rejects a tampered cookie", () => {
    const token = issueSession(
      { sub: "00000000-0000-4000-8000-000000000001", email: "demo-owner@signal-library.local", mode: "demo" },
      DEMO_SESSION_SECRET,
    );
    expect(readSession(`${token}x`, DEMO_SESSION_SECRET, "demo")).toBeNull();
  });

  it("compares owner passwords without accepting a different value", () => {
    expect(passwordsMatch("long-password", "long-password")).toBe(true);
    expect(passwordsMatch("long-password", "other-password")).toBe(false);
  });
});

describe("capture validation", () => {
  it("requires text or a URL and rejects a private-looking scheme", () => {
    expect(captureSchema.safeParse({ text: "", url: "" }).success).toBe(false);
    expect(captureSchema.safeParse({ url: "file:///tmp/secret" }).success).toBe(false);
    expect(captureSchema.safeParse({ text: "A note worth keeping for later review." }).success).toBe(true);
  });
});
