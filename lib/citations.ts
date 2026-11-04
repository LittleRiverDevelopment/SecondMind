export const INSUFFICIENT_ANSWER = "I don't have enough saved material in this library to answer that.";

export type ValidatedAnswer = {
  insufficient: boolean;
  body: string;
  citations: { chunkId: string; itemId: string }[];
  inferred: string[];
  applications: string[];
};

export function validateAnswer(
  draft: {
    insufficientEvidence: boolean;
    answer: string;
    citationIds: string[];
    inferredConnections: string[];
    suggestedApplications: string[];
  },
  allowed: { chunkId: string; itemId: string }[],
): ValidatedAnswer {
  const allowedIds = new Map(allowed.map((row) => [row.chunkId, row.itemId]));
  const citations = draft.citationIds.flatMap((chunkId) => {
    const itemId = allowedIds.get(chunkId);
    return itemId ? [{ chunkId, itemId }] : [];
  });
  const unique = citations.filter((citation, index) => citations.findIndex((row) => row.chunkId === citation.chunkId) === index);
  if (draft.insufficientEvidence || unique.length === 0) {
    return { insufficient: true, body: INSUFFICIENT_ANSWER, citations: [], inferred: [], applications: [] };
  }
  return {
    insufficient: false,
    body: draft.answer.trim(),
    citations: unique,
    inferred: draft.inferredConnections,
    applications: draft.suggestedApplications,
  };
}

export function keepKnownIds(ids: string[], allowed: Set<string>) {
  return [...new Set(ids.filter((id) => allowed.has(id)))];
}
