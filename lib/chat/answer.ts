import type { LibraryStore } from "@/lib/db/store";
import type { AiProvider } from "@/lib/ai/provider";
import { validateAnswer } from "@/lib/citations";
import { retrieve } from "@/lib/retrieval/search";

export async function answerQuestion(input: {
  store: LibraryStore;
  provider: AiProvider | null;
  question: string;
  filter: { topicId?: string; projectId?: string; from?: string; to?: string };
  chunkLimit: number;
  charLimit: number;
}) {
  if (!input.provider) {
    return { error: "AI provider is not configured." as const };
  }
  const project = input.filter.projectId ? await input.store.getProject(input.filter.projectId) : null;
  const hits = await retrieve({
    store: input.store,
    provider: input.provider,
    query: input.question,
    filter: input.filter,
    chunkLimit: input.chunkLimit,
    charLimit: input.charLimit,
  });
  if (hits.length === 0) {
    const validated = validateAnswer(
      {
        insufficientEvidence: true,
        answer: "",
        citationIds: [],
        inferredConnections: [],
        suggestedApplications: [],
      },
      [],
    );
    return { error: null, validated, provider: input.provider.kind, hits };
  }
  const draft = await input.provider.answer({
    question: input.question,
    chunks: hits.map((hit) => ({ id: hit.chunkId, itemId: hit.itemId, title: hit.title, text: hit.text })),
    projectContext: project
      ? { name: project.name, description: project.description, researchQuestion: project.researchQuestion }
      : null,
  });
  const validated = validateAnswer(
    draft.data,
    hits.map((hit) => ({ chunkId: hit.chunkId, itemId: hit.itemId })),
  );
  await input.store.recordUsage({
    kind: "answer",
    provider: input.provider.kind,
    model: draft.usage?.model,
    inputTokens: draft.usage?.inputTokens,
    outputTokens: draft.usage?.outputTokens,
  });
  return { error: null, validated, provider: input.provider.kind, hits };
}
