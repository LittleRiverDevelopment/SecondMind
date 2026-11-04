import type { LibraryStore } from "@/lib/db/store";
import type { DigestBody } from "@/lib/db/types";
import type { AiProvider } from "@/lib/ai/provider";
import { keepKnownIds } from "@/lib/citations";

export function emptyDigest(): DigestBody {
  return {
    themes: [],
    takeaways: [],
    connections: [],
    applications: [],
    gaps: ["Nothing was saved in this range."],
    empty: true,
  };
}

export async function buildDigest(input: {
  store: LibraryStore;
  provider: AiProvider | null;
  from: string;
  to: string;
  projectId?: string;
  topicId?: string;
}) {
  const recent = await input.store.itemsInRange({
    from: input.from,
    to: input.to,
    projectId: input.projectId,
    topicId: input.topicId,
  });
  if (recent.length === 0) {
    return { body: emptyDigest(), provider: null as string | null, itemIds: [] as string[] };
  }
  if (!input.provider) return { error: "AI provider is not configured." as const };
  const older = await input.store.listItems({
    status: "ready",
    projectId: input.projectId,
    topicId: input.topicId,
    to: shiftDate(input.from, -1),
    limit: 8,
  });
  const project = input.projectId ? await input.store.getProject(input.projectId) : null;
  const allowed = new Set([...recent.map((item) => item.id), ...older.map((item) => item.id)]);
  const draft = await input.provider.digest({
    recent: recent.map((item) => ({ id: item.id, title: item.title, summary: item.aiSummary })),
    older: older.map((item) => ({ id: item.id, title: item.title })),
    project: project ? { id: project.id, name: project.name, researchQuestion: project.researchQuestion } : null,
  });
  const body: DigestBody = {
    themes: draft.data.themes
      .map((section) => ({ ...section, itemIds: keepKnownIds(section.itemIds, allowed) }))
      .filter((section) => section.itemIds.length > 0),
    takeaways: draft.data.takeaways
      .map((section) => ({ ...section, itemIds: keepKnownIds(section.itemIds, allowed) }))
      .filter((section) => section.itemIds.length > 0),
    connections: draft.data.connections
      .map((section) => ({ ...section, itemIds: keepKnownIds(section.itemIds, allowed) }))
      .filter((section) => section.itemIds.length > 0),
    applications: draft.data.applications
      .map((section) => ({ ...section, itemIds: keepKnownIds(section.itemIds, allowed) }))
      .filter((section) => section.itemIds.length > 0),
    gaps: draft.data.gaps,
    empty: false,
  };
  if (body.connections.length === 0 && !body.gaps.some((gap) => /older/i.test(gap))) {
    body.gaps.push("No meaningful connection to older saves.");
  }
  const itemIds = [
    ...body.themes.flatMap((section) => section.itemIds),
    ...body.takeaways.flatMap((section) => section.itemIds),
    ...body.connections.flatMap((section) => section.itemIds),
    ...body.applications.flatMap((section) => section.itemIds),
  ];
  await input.store.recordUsage({
    kind: "digest",
    provider: input.provider.kind,
    model: draft.usage?.model,
    inputTokens: draft.usage?.inputTokens,
    outputTokens: draft.usage?.outputTokens,
  });
  return { body, provider: input.provider.kind, itemIds: [...new Set(itemIds)] };
}

function shiftDate(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
