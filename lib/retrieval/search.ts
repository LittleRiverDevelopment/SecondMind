import type { LibraryStore } from "@/lib/db/store";
import type { ItemFilter } from "@/lib/db/types";
import type { AiProvider } from "@/lib/ai/provider";
import { fuseChunkHits } from "@/lib/retrieval/fusion";

export async function retrieve(input: {
  store: LibraryStore;
  provider: AiProvider | null;
  query: string;
  filter: ItemFilter;
  chunkLimit: number;
  charLimit: number;
}) {
  const query = input.query.trim();
  if (!query) return [];
  const keyword = await input.store.keywordHits(query, input.filter);
  const lists = [keyword];
  if (input.provider) {
    const embedded = await input.provider.embed([query]);
    const semantic = await input.store.semanticHits(embedded.data[0]!, input.filter);
    lists.push(semantic);
  }
  return fuseChunkHits(lists, input.chunkLimit, input.charLimit);
}
