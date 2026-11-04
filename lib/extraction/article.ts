import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

export type ArticleExtract = {
  title: string | null;
  author: string | null;
  publishedAt: string | null;
  text: string;
};

export function extractArticle(html: string) {
  const { document } = parseHTML(html);
  const article = new Readability(document).parse();
  const text = article?.textContent?.replace(/\s+\n/g, "\n").trim() ?? "";
  const published = article?.publishedTime ? parseDate(article.publishedTime) : null;
  const author = article?.byline?.trim() || null;
  const title = article?.title?.trim() || null;
  return {
    title,
    author: author && author.length <= 200 ? author : null,
    publishedAt: published,
    text,
  } satisfies ArticleExtract;
}

function parseDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}
