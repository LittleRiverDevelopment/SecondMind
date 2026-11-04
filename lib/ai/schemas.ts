import { z } from "zod";

export const extractionSchema = z.strictObject({
  summary: z.string().trim().min(1).max(2000),
  takeaways: z.array(z.string().trim().min(1).max(500)).max(8),
  suggestedTopics: z
    .array(
      z.strictObject({
        name: z.string().trim().min(1).max(80),
        reason: z.string().trim().min(1).max(300),
      }),
    )
    .max(8),
});

export const answerSchema = z.strictObject({
  insufficientEvidence: z.boolean(),
  answer: z.string().max(4000),
  citationIds: z.array(z.string()).max(8),
  inferredConnections: z.array(z.string().max(500)).max(5),
  suggestedApplications: z.array(z.string().max(500)).max(5),
});

export const digestSchema = z.strictObject({
  themes: z.array(z.strictObject({ text: z.string().max(500), itemIds: z.array(z.string()).max(8) })).max(6),
  takeaways: z.array(z.strictObject({ text: z.string().max(500), itemIds: z.array(z.string()).max(8) })).max(8),
  connections: z.array(z.strictObject({ text: z.string().max(500), itemIds: z.array(z.string()).max(8) })).max(6),
  applications: z
    .array(
      z.strictObject({
        text: z.string().max(500),
        itemIds: z.array(z.string()).max(8),
        projectId: z.string().nullable(),
      }),
    )
    .max(4),
  gaps: z.array(z.string().max(400)).max(6),
});

export const briefSchema = z.strictObject({
  body: z.string().max(4000),
  itemIds: z.array(z.string()).max(20),
});

export type Extraction = z.infer<typeof extractionSchema>;
export type AnswerDraft = z.infer<typeof answerSchema>;
export type DigestDraft = z.infer<typeof digestSchema>;
export type BriefDraft = z.infer<typeof briefSchema>;

export type TokenUsage = { model: string; inputTokens: number | null; outputTokens: number | null };

export type AiResult<T> = { data: T; usage: TokenUsage | null };
