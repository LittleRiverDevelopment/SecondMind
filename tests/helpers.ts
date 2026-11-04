import { migrate, openPglite } from "@/lib/db/sql";
import { createLibraryStore, type LibraryStore } from "@/lib/db/store";

export const OWNER_A = "00000000-0000-4000-8000-0000000000a1";
export const OWNER_B = "00000000-0000-4000-8000-0000000000b2";

export async function testStore(ownerId = OWNER_A) {
  const sql = await openPglite();
  const migrated = await migrate(sql);
  const store = createLibraryStore(sql, ownerId, migrated.restrictedRole);
  const other = createLibraryStore(sql, OWNER_B, migrated.restrictedRole);
  return { sql, store, other, restrictedRole: migrated.restrictedRole };
}

export async function readyText(store: LibraryStore, text: string, title = "Note") {
  const topic = await store.createTopic("notes");
  const item = await store.createItem({
    sourceUrl: null,
    urlKey: null,
    contentHash: null,
    originalInput: { text, title },
    userPastedText: text,
    title,
    userNote: null,
    topicIds: [topic.id],
    projectId: null,
  });
  return item;
}
