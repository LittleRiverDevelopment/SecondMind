import { EMBEDDING_DIMENSIONS } from "@/lib/config";
import type { AnswerDraft, BriefDraft, DigestDraft, Extraction } from "@/lib/ai/schemas";

export function mockEmbedding(text: string) {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  const tokens = text.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2);
  for (const token of tokens) {
    let hash = 2166136261;
    for (const char of token) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    vector[Math.abs(hash) % EMBEDDING_DIMENSIONS] += 1;
  }
  const norm = Math.hypot(...vector) || 1;
  return vector.map((value) => value / norm);
}

function sentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

function isInstruction(sentence: string) {
  return /ignore (all |any |previous |prior )?instructions|system prompt|reply with the word/i.test(sentence);
}

const TOPIC_WORDS: [RegExp, string][] = [
  [/\bretention\b/i, "retention"],
  [/\bchecklist\b/i, "onboarding"],
  [/\btennis\b/i, "tennis"],
  [/\bserve\b/i, "tennis"],
  [/\bsubscription\b/i, "subscriptions"],
];

export function mockExtract(sourceText: string): Extraction {
  const usable = sentences(sourceText).filter((sentence) => !isInstruction(sentence));
  const chosen = (usable.length > 0 ? usable : sentences(sourceText)).slice(0, 3);
  const summary = chosen.slice(0, 2).join(" ").slice(0, 700) || sourceText.slice(0, 280);
  const suggested = new Map<string, string>();
  for (const [pattern, name] of TOPIC_WORDS) {
    if (pattern.test(sourceText)) suggested.set(name, `The source text mentions ${name}.`);
  }
  return {
    summary,
    takeaways: chosen.slice(0, 3).map((sentence) => sentence.slice(0, 400)),
    suggestedTopics: [...suggested.entries()].map(([name, reason]) => ({ name, reason })),
  };
}

export function mockAnswer(input: {
  question: string;
  chunks: { id: string; text: string }[];
}): AnswerDraft {
  const terms = new Set(input.question.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 3));
  const cited: string[] = [];
  const lines: string[] = [];
  for (const chunk of input.chunks) {
    const matching = sentences(chunk.text).filter((sentence) => {
      if (isInstruction(sentence)) return false;
      const tokens = sentence.toLowerCase().split(/[^a-z0-9]+/);
      return tokens.some((token) => terms.has(token));
    });
    if (matching.length > 0) {
      cited.push(chunk.id);
      lines.push(matching[0]!.slice(0, 400));
    }
  }
  if (cited.length === 0) {
    return {
      insufficientEvidence: true,
      answer: "",
      citationIds: [],
      inferredConnections: [],
      suggestedApplications: [],
    };
  }
  return {
    insufficientEvidence: false,
    answer: lines.join(" "),
    citationIds: cited.slice(0, 8),
    inferredConnections: [],
    suggestedApplications: [],
  };
}

export function mockDigest(input: {
  recent: { id: string; title: string | null; summary: string | null }[];
  older: { id: string; title: string | null }[];
  project: { id: string; name: string; researchQuestion: string } | null;
}): DigestDraft {
  const recent = input.recent.slice(0, 5);
  const themes = recent.map((item) => ({
    text: item.title || item.summary || "Untitled save",
    itemIds: [item.id],
  }));
  const takeaways = recent
    .filter((item) => item.summary)
    .map((item) => ({ text: item.summary!.slice(0, 400), itemIds: [item.id] }));
  const connections =
    input.older.length === 0
      ? []
      : [
          {
            text: `Older saves share library context with this range: ${input.older
              .slice(0, 3)
              .map((item) => item.title || "Untitled")
              .join(", ")}.`,
            itemIds: [...recent.map((item) => item.id), ...input.older.slice(0, 3).map((item) => item.id)],
          },
        ];
  const applications =
    input.project && recent.length > 0
      ? [
          {
            text: `Suggestion only: consider these saves against the ${input.project.name} question. This is not a claim from the sources.`,
            itemIds: recent.map((item) => item.id),
            projectId: input.project.id,
          },
        ]
      : [];
  const gaps = [
    ...(input.older.length === 0 ? ["No meaningful connection to older saves."] : []),
    ...(input.recent.length > 5 ? ["Some saves in the range were left out."] : []),
  ];
  return { themes, takeaways, connections, applications, gaps };
}

export function mockBrief(items: { id: string; title: string | null; summary: string | null }[]): BriefDraft {
  if (items.length === 0) {
    return { body: "No ready saves are assigned to this project yet.", itemIds: [] };
  }
  const body = items
    .map((item) => `${item.title || "Untitled"}: ${item.summary || "No summary is stored."}`)
    .join("\n");
  return { body: body.slice(0, 4000), itemIds: items.map((item) => item.id) };
}
