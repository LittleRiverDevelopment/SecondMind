import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import postgres from "postgres";

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

export async function openPglite(dataDir?: string): Promise<Sql> {
  if (dataDir) mkdirSync(dataDir, { recursive: true });
  const db = dataDir
    ? await PGlite.create(dataDir, { extensions: { vector }, relaxedDurability: true })
    : await PGlite.create({ extensions: { vector } });
  return fromQueryable(db as unknown as Queryable);
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
