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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ConfigResult {
  const nodeEnv = env.NODE_ENV ?? "development";
  let mode = env.APP_MODE?.trim();
  if (!mode) {
    if (nodeEnv === "production") {
      return { ok: false, reason: "APP_MODE is not set. Refusing to start." };
    }
    mode = "demo";
  }
  if (mode !== "demo" && mode !== "local" && mode !== "supabase") {
    return { ok: false, reason: "APP_MODE must be demo, local, or supabase." };
  }

  const databaseUrl = env.DATABASE_URL?.trim() || null;
  if (mode === "demo" && databaseUrl) {
    return {
      ok: false,
      reason: "Demo mode will not open DATABASE_URL. Unset it or change APP_MODE.",
    };
  }

  const dimensions = intEnv(env.EMBEDDING_DIMENSIONS, EMBEDDING_DIMENSIONS);
  if (dimensions !== EMBEDDING_DIMENSIONS) {
    return {
      ok: false,
      reason: `EMBEDDING_DIMENSIONS must be ${EMBEDDING_DIMENSIONS} to match the pgvector column.`,
    };
  }

  const aiRequested = env.AI_PROVIDER?.trim();
  let ai: AiMode;
  if (mode === "demo") {
    ai = "mock";
  } else if (aiRequested === "mock") {
    ai = "mock";
  } else if (aiRequested === "openai" || (!aiRequested && env.OPENAI_API_KEY?.trim())) {
    ai = "openai";
  } else if (!aiRequested) {
    ai = "unconfigured";
  } else {
    return { ok: false, reason: "AI_PROVIDER must be mock or openai." };
  }

  const openAiKey = mode === "demo" ? null : env.OPENAI_API_KEY?.trim() || null;
  if (ai === "openai" && !openAiKey) {
    return { ok: false, reason: "AI_PROVIDER=openai requires OPENAI_API_KEY." };
  }

  let ownerId = DEMO_OWNER_ID;
  let ownerEmail = DEMO_EMAIL;
  let ownerPassword: string | null = null;
  let sessionSecret = env.SESSION_SECRET?.trim() || "";
  let supabaseUrl: string | null = null;
  let supabaseAnonKey: string | null = null;

  if (mode === "demo") {
    sessionSecret = sessionSecret || DEMO_SESSION_SECRET;
  } else if (mode === "local") {
    const id = uuidSchema.safeParse(env.OWNER_ID?.trim());
    const email = z.email().safeParse(env.OWNER_EMAIL?.trim().toLowerCase());
    ownerPassword = env.OWNER_PASSWORD ?? "";
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
    const email = z.email().safeParse(env.OWNER_EMAIL?.trim().toLowerCase());
    const id = uuidSchema.safeParse(env.OWNER_ID?.trim());
    supabaseUrl = env.SUPABASE_URL?.trim() || null;
    supabaseAnonKey = env.SUPABASE_ANON_KEY?.trim() || null;
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
    pgliteDir: env.PGLITE_DIR?.trim() || (mode === "demo" ? ".data/demo" : ".data/local"),
    ai,
    openAiKey,
    extractionModel: env.OPENAI_EXTRACTION_MODEL?.trim() || "gpt-4o-mini",
    embeddingModel: env.OPENAI_EMBEDDING_MODEL?.trim() || "text-embedding-3-small",
    answerModel: env.OPENAI_ANSWER_MODEL?.trim() || "gpt-4o-mini",
    supabaseUrl,
    supabaseAnonKey,
    inlineWorker: env.INLINE_WORKER === "true" || mode === "demo",
    contextChunkLimit: intEnv(env.CONTEXT_CHUNK_LIMIT, 8),
    contextCharLimit: intEnv(env.CONTEXT_CHAR_LIMIT, 12_000),
    outputTokenLimit: intEnv(env.OUTPUT_TOKEN_LIMIT, 1200),
    captureLimitPerHour: intEnv(env.CAPTURE_LIMIT_PER_HOUR, 30),
    aiLimitPerHour: intEnv(env.AI_LIMIT_PER_HOUR, 20),
  };
}

export function requireConfig(env?: NodeJS.ProcessEnv): AppConfig {
  const config = loadConfig(env);
  if (!config.ok) {
    throw new Error(config.reason);
  }
  return config;
}
