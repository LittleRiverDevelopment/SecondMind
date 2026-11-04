import type { LibraryStore } from "@/lib/db/store";
import type { AiProvider } from "@/lib/ai/provider";
import { keepKnownIds } from "@/lib/citations";

export async function refreshBrief(store: LibraryStore, provider: AiProvider | null, projectId: string) {
  if (!provider) return { error: "AI provider is not configured." as const };
  const items = await store.itemsForBrief(projectId);
  const draft = await provider.brief(
    items.map((item) => ({ id: item.id, title: item.title, summary: item.aiSummary })),
  );
  const allowed = new Set(items.map((item) => item.id));
  const itemIds = keepKnownIds(draft.data.itemIds, allowed);
  const brief = await store.saveBrief({
    projectId,
    body: draft.data.body,
    citations: itemIds.map((itemId) => ({ itemId })),
    provider: provider.kind,
  });
  await store.recordUsage({
    kind: "brief",
    provider: provider.kind,
    model: draft.usage?.model,
    inputTokens: draft.usage?.inputTokens,
    outputTokens: draft.usage?.outputTokens,
  });
  return { brief };
}
