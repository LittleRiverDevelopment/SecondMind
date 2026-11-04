import type { LibraryStore } from "@/lib/db/store";
import type { ProcessingJob } from "@/lib/db/types";
import type { AiProvider } from "@/lib/ai/provider";
import { extractArticle } from "@/lib/extraction/article";
import { fetchPublicHtml, isUnsupportedSocialUrl, type FetchDeps } from "@/lib/extraction/ssrf";
import { chunkText } from "@/lib/processing/chunk";
import { collapseWhitespace, contentHash } from "@/lib/text";

const MIN_TEXT = 40;

export async function processJob(
  store: LibraryStore,
  job: ProcessingJob,
  deps: { provider: AiProvider | null; fetchUrl?: (url: string) => ReturnType<typeof fetchPublicHtml> },
) {
  const item = await store.getItem(job.itemId);
  if (!item) {
    await store.failAttempt(job, "The saved item is gone.");
    return;
  }
  let text = item.userPastedText?.trim() ?? "";
  let extractedText: string | null = null;
  let title: string | null = null;
  let author: string | null = null;
  let publishedAt: string | null = null;

  if (!text && item.sourceUrl) {
    if (isUnsupportedSocialUrl(item.sourceUrl)) {
      await store.markNeedsContent(job.itemId, job.id, "X posts are not extracted. Paste the post text to continue.");
      return;
    }
    const fetched = await (deps.fetchUrl ?? ((url: string) => fetchPublicHtml(url)))(item.sourceUrl);
    if (!fetched.ok) {
      await store.markNeedsContent(job.itemId, job.id, fetched.message);
      return;
    }
    const article = extractArticle(fetched.html);
    extractedText = article.text;
    title = article.title;
    author = article.author;
    publishedAt = article.publishedAt;
    text = article.text;
  }

  if (collapseWhitespace(text).length < MIN_TEXT) {
    await store.markNeedsContent(job.itemId, job.id, "There isn't enough text yet. Paste the content to continue.");
    return;
  }
  if (!deps.provider) {
    await store.failAttempt(job, "AI provider is not configured.");
    return;
  }

  const extracted = await deps.provider.extract(text.slice(0, 24_000));
  const chunks = chunkText(text);
  const embedded = await deps.provider.embed(chunks);
  await store.recordUsage({
    kind: "extract",
    provider: deps.provider.kind,
    model: extracted.usage?.model,
    inputTokens: extracted.usage?.inputTokens,
    outputTokens: extracted.usage?.outputTokens,
  });
  await store.recordUsage({
    kind: "embed",
    provider: deps.provider.kind,
    model: embedded.usage?.model,
    inputTokens: embedded.usage?.inputTokens,
    outputTokens: embedded.usage?.outputTokens,
  });
  await store.completeProcessing({
    jobId: job.id,
    itemId: job.itemId,
    extractedText,
    title,
    author,
    publishedAt,
    contentHash: contentHash(text),
    summary: extracted.data.summary,
    takeaways: extracted.data.takeaways,
    suggestedTopics: extracted.data.suggestedTopics,
    provider: deps.provider.kind,
    chunks: chunks.map((chunk, index) => ({ text: chunk, embedding: embedded.data[index]! })),
  });
}

export type { FetchDeps };
