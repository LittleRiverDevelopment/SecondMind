import { loadConfig } from "@/lib/config";
import { releaseStartupMemory } from "@/lib/db/wasm-memory";
import { createLibraryStore, type LibraryStore } from "@/lib/db/store";
import { migrate, openPglite, openPostgres, type Sql } from "@/lib/db/sql";
import { mockEmbedding } from "@/lib/ai/mock";

const DEMO_PROJECT_TENNIS = "00000000-0000-4000-8000-000000000201";
const DEMO_PROJECT_RETENTION = "00000000-0000-4000-8000-000000000202";
const DEMO_ITEM_TENNIS = "00000000-0000-4000-8000-000000000101";
const DEMO_ITEM_RETENTION = "00000000-0000-4000-8000-000000000102";

const globalForDb = globalThis as unknown as {
  signalStore?: Promise<LibraryStore>;
  signalWorker?: boolean;
};

export async function createReadyStore(sql?: Sql) {
  const config = loadConfig();
  if (!config.ok) throw new Error(config.reason);
  const database = sql ?? (config.dataDriver === "postgres" ? openPostgres(config.databaseUrl!) : await openPglite(config.pgliteDir));
  const migrated = await migrate(database);
  const store = createLibraryStore(database, config.ownerId, migrated.restrictedRole);
  if (config.mode === "demo") await seedDemo(database, store);
  releaseStartupMemory();
  return store;
}

const globalAttempts = globalThis as typeof globalThis & { __signalDbAttempts?: number };

export function getStore() {
  if (!globalForDb.signalStore) {
    const attempt = (globalAttempts.__signalDbAttempts ?? 0) + 1;
    globalAttempts.__signalDbAttempts = attempt;
    globalForDb.signalStore = createReadyStore().catch((error) => {
      // One retry reclones after a failed copy. Further requests reuse this
      // rejection so a dead database cannot restart every second.
      if (attempt < 2) globalForDb.signalStore = undefined;
      throw error;
    });
  }
  return globalForDb.signalStore;
}

export function markWorkerStarted() {
  if (globalForDb.signalWorker) return false;
  globalForDb.signalWorker = true;
  return true;
}

async function seedDemo(sql: Sql, store: LibraryStore) {
  const inserted = await sql.query(
    `INSERT INTO app_meta (key, value) VALUES ('demo_seeded', '1') ON CONFLICT DO NOTHING RETURNING key`,
  );
  if (inserted.length === 0) return;
  await sql.query(
    `INSERT INTO projects (id, owner_id, name, description, research_question, status)
     VALUES
       ($1, $3, 'Demo tennis', 'Synthetic project for serve practice notes.', 'What should the next practice focus on?', 'active'),
       ($2, $3, 'Demo retention', 'Synthetic project about a fictional subscription.', 'Which onboarding ideas are worth trying?', 'active')`,
    [DEMO_PROJECT_TENNIS, DEMO_PROJECT_RETENTION, store.ownerId],
  );
  await store.saveReadyItem({
    id: DEMO_ITEM_TENNIS,
    title: "Synthetic demo: kick serve toss",
    text: "Synthetic demo note. Keep the kick serve toss in front of the hitting shoulder. A late toss makes the tennis serve fall short. This text was written for the local demo and is not a real article.",
    summary: "Demo preview: the note says to keep the kick serve toss in front of the hitting shoulder.",
    takeaways: ["Keep the toss in front of the hitting shoulder."],
    note: "Saved for the demo tennis project.",
    topicNames: ["tennis"],
    projectIds: [DEMO_PROJECT_TENNIS],
    embedding: mockEmbedding,
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
  });
  await store.saveReadyItem({
    id: DEMO_ITEM_RETENTION,
    title: "Synthetic demo: Northwind checklist",
    text: "Synthetic demo source. Northwind's fictional onboarding study found that users who completed a checklist in week one renewed more often. This is not a real study and not a verified fact.",
    summary: "Demo preview: the fictional Northwind note says checklist completion in week one lined up with renewal.",
    takeaways: ["The fictional note links a week-one checklist with renewal."],
    sourceUrl: "https://example.com/synthetic-northwind-retention",
    urlKey: "https://example.com/synthetic-northwind-retention",
    topicNames: ["retention"],
    projectIds: [DEMO_PROJECT_RETENTION],
    embedding: mockEmbedding,
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  });
  await sql.query(
    `INSERT INTO saved_items (
       id, owner_id, source_url, url_key, original_input, title, status, safe_error, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $3, $4::jsonb, $5, 'needs_content', $6, now(), now()
     )`,
    [
      "00000000-0000-4000-8000-000000000103",
      store.ownerId,
      "https://x.com/example/status/1",
      JSON.stringify({ url: "https://x.com/example/status/1", text: "" }),
      "Synthetic demo: an X link that needs text",
      "X posts are not extracted. Paste the post text to continue.",
    ],
  );
}
