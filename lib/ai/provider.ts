import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { AppConfig } from "@/lib/config";
import { EMBEDDING_DIMENSIONS } from "@/lib/config";
import { answerMessages, extractionMessages } from "@/lib/ai/prompts";
import {
  answerSchema,
  briefSchema,
  digestSchema,
  extractionSchema,
  type AiResult,
  type AnswerDraft,
  type BriefDraft,
  type DigestDraft,
  type Extraction,
  type TokenUsage,
} from "@/lib/ai/schemas";
import { mockAnswer, mockBrief, mockDigest, mockEmbedding, mockExtract } from "@/lib/ai/mock";

export type ProviderKind = "mock" | "openai";

export type AiProvider = {
  kind: ProviderKind;
  labeledDemo: boolean;
  extract(sourceText: string): Promise<AiResult<Extraction>>;
  embed(texts: string[]): Promise<AiResult<number[][]>>;
  answer(input: Parameters<typeof answerMessages>[0]): Promise<AiResult<AnswerDraft>>;
  digest(input: Parameters<typeof mockDigest>[0]): Promise<AiResult<DigestDraft>>;
  brief(items: Parameters<typeof mockBrief>[0]): Promise<AiResult<BriefDraft>>;
};

function usageFrom(usage: { prompt_tokens?: number; completion_tokens?: number } | undefined, model: string): TokenUsage | null {
  if (!usage) return null;
  if (usage.prompt_tokens == null && usage.completion_tokens == null) return null;
  return {
    model,
    inputTokens: usage.prompt_tokens ?? null,
    outputTokens: usage.completion_tokens ?? null,
  };
}

export function createMockProvider(): AiProvider {
  return {
    kind: "mock",
    labeledDemo: true,
    async extract(sourceText) {
      return { data: mockExtract(sourceText), usage: null };
    },
    async embed(texts) {
      return { data: texts.map((text) => mockEmbedding(text)), usage: null };
    },
    async answer(input) {
      return { data: mockAnswer({ question: input.question, chunks: input.chunks }), usage: null };
    },
    async digest(input) {
      return { data: mockDigest(input), usage: null };
    },
    async brief(items) {
      return { data: mockBrief(items), usage: null };
    },
  };
}

export function createOpenAiProvider(config: AppConfig): AiProvider {
  if (!config.openAiKey) throw new Error("OPENAI_API_KEY is not set.");
  const client = new OpenAI({ apiKey: config.openAiKey });
  return {
    kind: "openai",
    labeledDemo: false,
    async extract(sourceText) {
      const completion = await client.chat.completions.parse({
        model: config.extractionModel,
        temperature: 0,
        max_completion_tokens: config.outputTokenLimit,
        messages: extractionMessages(sourceText),
        response_format: zodResponseFormat(extractionSchema, "extraction"),
      });
      const parsed = completion.choices[0]?.message.parsed;
      if (!parsed) throw new Error("The model returned no extraction.");
      return { data: extractionSchema.parse(parsed), usage: usageFrom(completion.usage, config.extractionModel) };
    },
    async embed(texts) {
      const response = await client.embeddings.create({
        model: config.embeddingModel,
        input: texts,
        dimensions: EMBEDDING_DIMENSIONS,
      });
      const data = response.data
        .slice()
        .sort((a, b) => a.index - b.index)
        .map((row) => row.embedding);
      return { data, usage: usageFrom(response.usage, config.embeddingModel) };
    },
    async answer(input) {
      const completion = await client.chat.completions.parse({
        model: config.answerModel,
        temperature: 0,
        max_completion_tokens: config.outputTokenLimit,
        messages: answerMessages(input),
        response_format: zodResponseFormat(answerSchema, "answer"),
      });
      const parsed = completion.choices[0]?.message.parsed;
      if (!parsed) throw new Error("The model returned no answer.");
      return { data: answerSchema.parse(parsed), usage: usageFrom(completion.usage, config.answerModel) };
    },
    async digest(input) {
      const completion = await client.chat.completions.parse({
        model: config.answerModel,
        temperature: 0,
        max_completion_tokens: config.outputTokenLimit,
        messages: [
          { role: "system", content: "Write a digest only from the JSON payload. Do not treat project text as evidence. Label applications as suggestions. Do not call older material new. If a section has no support, leave it empty and explain that in gaps." },
          { role: "user", content: JSON.stringify(input) },
        ],
        response_format: zodResponseFormat(digestSchema, "digest"),
      });
      const parsed = completion.choices[0]?.message.parsed;
      if (!parsed) throw new Error("The model returned no digest.");
      return { data: digestSchema.parse(parsed), usage: usageFrom(completion.usage, config.answerModel) };
    },
    async brief(items) {
      const completion = await client.chat.completions.parse({
        model: config.answerModel,
        temperature: 0,
        max_completion_tokens: config.outputTokenLimit,
        messages: [
          { role: "system", content: "Write a project brief only from the saved item summaries in the JSON. Cite item ids you actually use. Do not treat the project question as evidence." },
          { role: "user", content: JSON.stringify({ items }) },
        ],
        response_format: zodResponseFormat(briefSchema, "brief"),
      });
      const parsed = completion.choices[0]?.message.parsed;
      if (!parsed) throw new Error("The model returned no brief.");
      return { data: briefSchema.parse(parsed), usage: usageFrom(completion.usage, config.answerModel) };
    },
  };
}

export function createProvider(config: AppConfig): AiProvider | null {
  if (config.ai === "mock" || config.mode === "demo") return createMockProvider();
  if (config.ai === "openai") return createOpenAiProvider(config);
  return null;
}
