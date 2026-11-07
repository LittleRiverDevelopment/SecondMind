import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { onRenderHost } from "@/lib/config";
import "@/lib/db/wasm-memory";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import postgres from "postgres";

const DEMO_CLUSTER = path.join(process.cwd(), "data", "demo-cluster");

// Git only stores files, so a clone of the prepared cluster omits these empty
// directories. Postgres exits immediately when one of them is missing.
export const PGLITE_CLUSTER_DIRS = [
  "pg_commit_ts",
  "pg_dynshmem",
  "pg_logical/mappings",
  "pg_logical/snapshots",
  "pg_notify",
  "pg_replslot",
  "pg_serial",
  "pg_snapshots",
  "pg_stat",
  "pg_stat_tmp",
  "pg_tblspc",
  "pg_twophase",
  "pg_wal/archive_status",
  "pg_wal/summaries",
];

export function ensureClusterDirectories(dataDir: string) {
  for (const dir of PGLITE_CLUSTER_DIRS) mkdirSync(path.join(dataDir, dir), { recursive: true });
}

export type SqlRow = Record<string, unknown>;

export type Sql = {
  query<T extends SqlRow = SqlRow>(text: string, params?: unknown[]): Promise<T[]>;
  exec(text: string): Promise<void>;
  transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T>;
};

type Queryable = {
  query<T>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(text: string): Promise<unknown>;
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
};

function fromQueryable(db: Queryable): Sql {
  return {
    query: async (text, params = []) => {
      const result = await db.query<SqlRow>(text, params);
      return result.rows as SqlRow[];
    },
    exec: async (text) => {
      await db.exec(text);
    },
    transaction: (fn) => db.transaction(async (tx) => fn(fromQueryable(tx))),
  } as Sql;
}

// These replace PGlite's defaults, so the single-user flags stay here too.
// shared_buffers stays small: the prepared cluster's 64MB setting does not fit
// beside Next.js inside a 512 MB instance, and Postgres then exits immediately.
const PGLITE_START_PARAMS = [
  "--single",
  "-F",
  "-O",
  "-j",
  "-c",
  "search_path=public",
  "-c",
  "exit_on_error=false",
  "-c",
  "log_checkpoints=false",
  "-c",
  "max_worker_processes=0",
  "-c",
  "max_parallel_workers=0",
  "-c",
  "max_parallel_workers_per_gather=0",
  "-c",
  "io_method=sync",
  "-c",
  "max_parallel_maintenance_workers=0",
  "-c",
  "shared_buffers=8MB",
  "-c",
  "max_connections=8",
  "-c",
  "work_mem=1MB",
  "-c",
  "maintenance_work_mem=8MB",
  "-c",
  "wal_buffers=512kB",
  "-c",
  "temp_buffers=2MB",
  "-c",
  "huge_pages=off",
  "-c",
  "dynamic_shared_memory_type=posix",
];

export function cloneDemoCluster(dataDir: string) {
  const clone = onRenderHost() || process.env.CLONE_DEMO_CLUSTER === "1";
  const version = path.join(dataDir, "PG_VERSION");
  const seed = path.join(DEMO_CLUSTER, "PG_VERSION");
  if (!clone || existsSync(version) || !existsSync(seed)) {
    if (clone && !existsSync(seed)) console.error("prepared database is missing", DEMO_CLUSTER);
    return;
  }
  mkdirSync(dataDir, { recursive: true });
  cpSync(DEMO_CLUSTER, dataDir, {
    recursive: true,
    filter: (source) => path.basename(source) !== "postmaster.pid",
  });
  rmSync(path.join(dataDir, "postmaster.pid"), { force: true });
}

function pgliteOptions() {
  const notes: string[] = [];
  return {
    notes,
    options: {
      extensions: { vector },
      relaxedDurability: true,
      startParams: PGLITE_START_PARAMS,
      onStderr: (text: string) => {
        notes.push(text);
        return true;
      },
    },
  };
}

function describePgliteFailure(error: unknown, notes: string[]) {
  const detail = notes.join("").trim().slice(-1500);
  const message = error instanceof Error ? error.message : String(error);
  if (!detail || message.includes(detail.slice(0, 80))) return error;
  const wrapped = new Error(`${message}: ${detail}`);
  if (error instanceof Error) wrapped.cause = error;
  return wrapped;
}

export async function openPglite(dataDir?: string): Promise<Sql> {
  if (dataDir) {
    mkdirSync(dataDir, { recursive: true });
    cloneDemoCluster(dataDir);
    ensureClusterDirectories(dataDir);
  }
  const { notes, options } = pgliteOptions();
  try {
    const db = dataDir ? await PGlite.create(dataDir, options) : await PGlite.create(options);
    return fromQueryable(db as unknown as Queryable);
  } catch (error) {
    // The Render copy is disposable. Drop it so the one retry starts from the
    // prepared files again. Leave a local database in place.
    if (dataDir && onRenderHost() && path.resolve(dataDir) !== path.resolve(DEMO_CLUSTER)) {
      rmSync(dataDir, { recursive: true, force: true });
    }
    throw describePgliteFailure(error, notes);
  }
}

export async function createClosablePglite(dataDir: string) {
  rmSync(dataDir, { recursive: true, force: true });
  mkdirSync(dataDir, { recursive: true });
  ensureClusterDirectories(dataDir);
  const db = await PGlite.create(dataDir, pgliteOptions().options);
  return {
    sql: fromQueryable(db as unknown as Queryable),
    checkpoint: () => db.exec("CHECKPOINT"),
    close: () => db.close(),
  };
}

type PgQueryable = {
  unsafe(text: string, params?: unknown[]): Promise<SqlRow[]>;
  begin<T>(fn: (tx: PgQueryable) => Promise<T>): Promise<T>;
};

export function openPostgres(databaseUrl: string): Sql {
  const sql = postgres(databaseUrl, { max: 5, idle_timeout: 20, connect_timeout: 10 }) as unknown as PgQueryable;
  const wrap = (tx: PgQueryable): Sql => ({
    query: async <T extends SqlRow>(text: string, params: unknown[] = []) => (await tx.unsafe(text, params)) as T[],
    exec: async (text) => {
      await tx.unsafe(text);
    },
    transaction: (fn) => tx.begin((inner) => fn(wrap(inner))),
  });
  return wrap(sql);
}

export async function migrate(sql: Sql, migrationsDir = path.join(process.cwd(), "db", "migrations")) {
  await sql.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`,
  );
  try {
    await sql.exec("CREATE ROLE signal_app NOLOGIN NOSUPERUSER NOBYPASSRLS");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/already exists/i.test(message)) throw error;
  }
  const applied = await sql.query<{ id: string }>("SELECT id FROM schema_migrations");
  const done = new Set(applied.map((row) => row.id));
  const file = "001_init.sql";
  if (!done.has(file)) {
    const body = readFileSync(path.join(migrationsDir, file), "utf8");
    await sql.exec(body);
    await sql.exec(
      `GRANT USAGE ON SCHEMA public, app TO signal_app;
       GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO signal_app;
       GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO signal_app;
       REVOKE ALL ON TABLE schema_migrations FROM signal_app;`,
    );
    await sql.query("INSERT INTO schema_migrations (id) VALUES ($1)", [file]);
  }
  const roles = await sql.query("SELECT 1 AS ok FROM pg_roles WHERE rolname = 'signal_app'");
  return { restrictedRole: roles.length > 0 };
}
