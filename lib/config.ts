import { env as runtimeEnv } from "node:process";
import { z } from "zod";

export const DEMO_OWNER_ID = "00000000-0000-4000-8000-000000000001";
export const DEMO_EMAIL = "demo-owner@signal-library.local";
export const EMBEDDING_DIMENSIONS = 256;
export const DEMO_SESSION_SECRET = "demo-mode-only-not-a-credential";

const uuidSchema = z.uuid();

export type AppMode = "demo" | "local" | "supabase";
export type AiMode = "mock" | "openai" | "unconfigured";
export type DataDriver = "pglite" | "postgres";

export type AppConfig = {
  ok: true;
  mode: AppMode;
  ownerId: string;
  ownerEmail: string;
  ownerPassword: string | null;
  sessionSecret: string;
  dataDriver: DataDriver;
  databaseUrl: string | null;
  pgliteDir: string;
  ai: AiMode;
  openAiKey: string | null;
  extractionModel: string;
  embeddingModel: string;
  answerModel: string;
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  inlineWorker: boolean;
  contextChunkLimit: number;
  contextCharLimit: number;
  outputTokenLimit: number;
  captureLimitPerHour: number;
  aiLimitPerHour: number;
};

export type ConfigResult = AppConfig | { ok: false; reason: string };

function intEnv(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readEnv(env: NodeJS.ProcessEnv, name: string) {
  const value = env[name];
  return typeof value === "string" ? value.trim() : "";
}

function hostEnv(env?: NodeJS.ProcessEnv) {
  return env ?? runtimeEnv;
}

export function onRenderHost(env?: NodeJS.ProcessEnv) {
  const source = hostEnv(env);
  return readEnv(source, "RENDER") === "true" || readEnv(source, "RENDER_SERVICE_ID").length > 0 || readEnv(source, "RENDER_EXTERNAL_URL").length > 0;
}

export function configuredMode(env?: NodeJS.ProcessEnv) {
  const source = hostEnv(env);
  const explicit = readEnv(source, "APP_MODE");
  if (explicit) return explicit;
  if ((readEnv(source, "NODE_ENV") || "development") !== "production") return "demo";
  if (onRenderHost(source)) return "demo";
  return "";
}

export function loadConfig(env?: NodeJS.ProcessEnv): ConfigResult {
  const source = hostEnv(env);
  const mode = configuredMode(source);
  if (!mode) {
    return { ok: false, reason: "APP_MODE is not set. Refusing to start." };
  }
  if (mode !== "demo" && mode !== "local" && mode !== "supabase") {
    return { ok: false, reason: "APP_MODE must be demo, local, or supabase." };
  }

  const linkedDatabase = readEnv(source, "DATABASE_URL");
  const implicitRenderDemo = mode === "demo" && !readEnv(source, "APP_MODE") && onRenderHost(source);
  const databaseUrl = linkedDatabase && !implicitRenderDemo ? linkedDatabase : null;
  if (mode === "demo" && databaseUrl) {
    return {
      ok: false,
      reason: "Demo mode will not open DATABASE_URL. Unset it or change APP_MODE.",
    };
  }

  const dimensions = intEnv(source.EMBEDDING_DIMENSIONS, EMBEDDING_DIMENSIONS);
  if (dimensions !== EMBEDDING_DIMENSIONS) {
    return {
      ok: false,
      reason: `EMBEDDING_DIMENSIONS must be ${EMBEDDING_DIMENSIONS} to match the pgvector column.`,
    };
  }

  const aiRequested = readEnv(source, "AI_PROVIDER");
  let ai: AiMode;
  if (mode === "demo") {
    ai = "mock";
  } else if (aiRequested === "mock") {
    ai = "mock";
  } else if (aiRequested === "openai" || (!aiRequested && readEnv(source, "OPENAI_API_KEY"))) {
    ai = "openai";
  } else if (!aiRequested) {
    ai = "unconfigured";
  } else {
    return { ok: false, reason: "AI_PROVIDER must be mock or openai." };
  }

  const openAiKey = mode === "demo" ? null : readEnv(source, "OPENAI_API_KEY") || null;
  if (ai === "openai" && !openAiKey) {
    return { ok: false, reason: "AI_PROVIDER=openai requires OPENAI_API_KEY." };
  }

  let ownerId = DEMO_OWNER_ID;
  let ownerEmail = DEMO_EMAIL;
  let ownerPassword: string | null = null;
  let sessionSecret = readEnv(source, "SESSION_SECRET");
  let supabaseUrl: string | null = null;
  let supabaseAnonKey: string | null = null;

  if (mode === "demo") {
    sessionSecret = sessionSecret || DEMO_SESSION_SECRET;
  } else if (mode === "local") {
    const id = uuidSchema.safeParse(readEnv(source, "OWNER_ID"));
    const email = z.email().safeParse(readEnv(source, "OWNER_EMAIL").toLowerCase());
    ownerPassword = source.OWNER_PASSWORD ?? "";
    if (!id.success || !email.success || ownerPassword.length < 8 || sessionSecret.length < 16) {
      return {
        ok: false,
        reason:
          "Local mode requires OWNER_ID (uuid), OWNER_EMAIL, OWNER_PASSWORD (8+ characters), and SESSION_SECRET (16+ characters).",
      };
    }
    ownerId = id.data;
    ownerEmail = email.data;
  } else {
    const email = z.email().safeParse(readEnv(source, "OWNER_EMAIL").toLowerCase());
    const id = uuidSchema.safeParse(readEnv(source, "OWNER_ID"));
    supabaseUrl = readEnv(source, "SUPABASE_URL") || null;
    supabaseAnonKey = readEnv(source, "SUPABASE_ANON_KEY") || null;
    if (!email.success || !id.success || !supabaseUrl || !supabaseAnonKey || !databaseUrl || sessionSecret.length < 16) {
      return {
        ok: false,
        reason:
          "Supabase mode requires SUPABASE_URL, SUPABASE_ANON_KEY, DATABASE_URL, OWNER_ID, OWNER_EMAIL, and SESSION_SECRET (16+ characters).",
      };
    }
    ownerId = id.data;
    ownerEmail = email.data;
  }

  const dataDriver: DataDriver = databaseUrl ? "postgres" : "pglite";

  return {
    ok: true,
    mode,
    ownerId,
    ownerEmail,
    ownerPassword,
    sessionSecret,
    dataDriver,
    databaseUrl,
    pgliteDir: readEnv(source, "PGLITE_DIR") || (mode === "demo" ? ".data/demo" : ".data/local"),
    ai,
    openAiKey,
    extractionModel: readEnv(source, "OPENAI_EXTRACTION_MODEL") || "gpt-4o-mini",
    embeddingModel: readEnv(source, "OPENAI_EMBEDDING_MODEL") || "text-embedding-3-small",
    answerModel: readEnv(source, "OPENAI_ANSWER_MODEL") || "gpt-4o-mini",
    supabaseUrl,
    supabaseAnonKey,
    inlineWorker: readEnv(source, "INLINE_WORKER") === "true" || mode === "demo",
    contextChunkLimit: intEnv(source.CONTEXT_CHUNK_LIMIT, 8),
    contextCharLimit: intEnv(source.CONTEXT_CHAR_LIMIT, 12_000),
    outputTokenLimit: intEnv(source.OUTPUT_TOKEN_LIMIT, 1200),
    captureLimitPerHour: intEnv(source.CAPTURE_LIMIT_PER_HOUR, 30),
    aiLimitPerHour: intEnv(source.AI_LIMIT_PER_HOUR, 20),
  };
}

export function requireConfig(env?: NodeJS.ProcessEnv): AppConfig {
  const config = loadConfig(env);
  if (!config.ok) {
    throw new Error(config.reason);
  }
  return config;
}
