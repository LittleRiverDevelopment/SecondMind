import Link from "next/link";
import { CaptureForm } from "@/components/capture-form";
import { ProcessingPoller } from "@/components/processing-poller";
import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { createProvider } from "@/lib/ai/provider";
import type { ItemStatus } from "@/lib/db/types";
import { domainOf, preview } from "@/lib/text";
import { formatWhen, one, pageContext } from "@/lib/page";
import { searchLibrary } from "@/lib/retrieval/library";

const statuses: ItemStatus[] = ["captured", "processing", "ready", "needs_content", "failed"];

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { store, config } = await pageContext();
  const filter = {
    query: one(params.q),
    topicId: one(params.topic),
    projectId: one(params.project),
    status: one(params.status) as ItemStatus | "",
    sort: one(params.sort) === "oldest" ? "oldest" as const : "newest" as const,
  };
  const view = one(params.view) === "card" ? "card" : "list";
  const [items, topics, projects] = await Promise.all([
    searchLibrary({
      store,
      provider: createProvider(config),
      filter,
      chunkLimit: config.contextChunkLimit,
      charLimit: config.contextCharLimit,
    }),
    store.listTopics(),
    store.listProjects(),
  ]);
  return (
    <div className="grid gap-6">
      <ProcessingPoller active={items.some((item) => item.status === "captured" || item.status === "processing")} />
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Library</h1>
        <p className="mt-1 text-sm text-muted">Save a link or paste the text. The original stays attached to the note.</p>
      </div>
      <Card>
        <h2 className="mb-3 text-lg font-semibold">Save something</h2>
        <CaptureForm projects={projects.filter((project) => project.status === "active")} />
      </Card>
      <form className="grid gap-3 md:grid-cols-6" method="get">
        <input
          className="h-10 rounded-lg border border-border bg-card px-3 text-sm md:col-span-2"
          name="q"
          defaultValue={filter.query}
          placeholder="Search"
          aria-label="Search"
        />
        <select className="h-10 rounded-lg border border-border bg-card px-2 text-sm" name="topic" defaultValue={filter.topicId} aria-label="Topic">
          <option value="">All topics</option>
          {topics.map((topic) => (
            <option key={topic.id} value={topic.id}>
              {topic.name}
            </option>
          ))}
        </select>
        <select className="h-10 rounded-lg border border-border bg-card px-2 text-sm" name="project" defaultValue={filter.projectId} aria-label="Project">
          <option value="">All projects</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
        <select className="h-10 rounded-lg border border-border bg-card px-2 text-sm" name="status" defaultValue={filter.status} aria-label="Processing state">
          <option value="">Any state</option>
          {statuses.map((status) => (
            <option key={status} value={status}>
              {status.replace("_", " ")}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <select className="h-10 flex-1 rounded-lg border border-border bg-card px-2 text-sm" name="sort" defaultValue={filter.sort} aria-label="Sort">
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
          </select>
          <input type="hidden" name="view" value={view} />
          <button className="rounded-lg border border-border px-3 text-sm" type="submit">
            Apply
          </button>
        </div>
      </form>
      <div className="flex items-center justify-between text-sm">
        <Link className="underline" href="/topics">
          Manage topics
        </Link>
        <div className="flex gap-2">
          <Link href={queryHref(params, { view: "list" })} aria-current={view === "list" ? "page" : undefined}>
            List
          </Link>
          <Link href={queryHref(params, { view: "card" })} aria-current={view === "card" ? "page" : undefined}>
            Cards
          </Link>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted">Nothing saved matches this view yet.</p>
      ) : (
        <ul className={view === "card" ? "grid gap-3 md:grid-cols-2" : "grid gap-2"}>
          {items.map((item) => (
            <li key={item.id}>
              <Link href={`/items/${item.id}`} className="block rounded-2xl border border-border bg-card p-4 hover:border-accent" data-testid="item-link">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-medium">{item.title || "Untitled"}</h2>
                  <StatusBadge status={item.status} />
                </div>
                <p className="mt-1 text-xs text-muted">
                  {domainOf(item.sourceUrl) ? `${domainOf(item.sourceUrl)} · ` : ""}
                  {formatWhen(item.createdAt)}
                </p>
                <p className="mt-2 text-sm text-muted">{preview(item.aiSummary || item.userPastedText || item.extractedText || item.userNote)}</p>
                <p className="mt-2 text-xs text-muted">
                  {item.topics.filter((topic) => topic.confirmed).map((topic) => topic.name).join(", ") || "No topics"}
                  {item.projects.length ? ` · ${item.projects.map((project) => project.name).join(", ")}` : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function queryHref(params: Record<string, string | string[] | undefined>, patch: Record<string, string>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const single = one(value);
    if (single) search.set(key, single);
  }
  for (const [key, value] of Object.entries(patch)) search.set(key, value);
  const query = search.toString();
  return query ? `/?${query}` : "/";
}
