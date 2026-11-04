import type { AiProvider } from "@/lib/ai/provider";
import type { LibraryStore } from "@/lib/db/store";
import type { ItemFilter, SavedItem } from "@/lib/db/types";
import { retrieve } from "@/lib/retrieval/search";

export async function searchLibrary(input: {
  store: LibraryStore;
  provider: AiProvider | null;
  filter: ItemFilter;
  chunkLimit: number;
  charLimit: number;
}) {
  const keywordItems = await input.store.listItems(input.filter);
  if (!input.filter.query || !input.provider || (input.filter.status && input.filter.status !== "ready")) {
    return keywordItems;
  }
  const hits = await retrieve({
    store: input.store,
    provider: input.provider,
    query: input.filter.query,
    filter: input.filter,
    chunkLimit: input.chunkLimit,
    charLimit: input.charLimit,
  });
  const ordered = [...hits.map((hit) => hit.itemId), ...keywordItems.map((item) => item.id)];
  const unique = [...new Set(ordered)];
  const known = new Map(keywordItems.map((item) => [item.id, item]));
  const items: SavedItem[] = [];
  for (const id of unique) {
    const item = known.get(id) ?? (await input.store.getItem(id));
    if (item) items.push(item);
  }
  return items;
}
