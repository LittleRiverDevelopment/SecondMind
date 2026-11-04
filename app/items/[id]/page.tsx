import Link from "next/link";
import { acceptTopic, assignProjects, pasteContent, removeItem, retryItem, updateNote } from "@/app/actions";
import { ProcessingPoller } from "@/components/processing-poller";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { domainOf } from "@/lib/text";
import { formatWhen, pageContext } from "@/lib/page";

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { store } = await pageContext();
  const item = await store.getItem(id);
  if (!item) {
    return <p>That save is not in the library.</p>;
  }
  const projects = await store.listProjects();
  const confirmed = new Set(item.topics.filter((topic) => topic.confirmed).map((topic) => topic.name.toLowerCase()));
  const suggestions = item.suggestedTopics.filter((topic) => !confirmed.has(topic.name.toLowerCase()));
  const source = item.userPastedText || item.extractedText;
  return (
    <article className="grid gap-5">
      <ProcessingPoller active={item.status === "captured" || item.status === "processing"} />
      <div>
        <p className="text-sm text-muted">
          <Link className="underline" href="/">
            Library
          </Link>
          {domainOf(item.sourceUrl) ? ` · ${domainOf(item.sourceUrl)}` : ""} · {formatWhen(item.createdAt)}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">{item.title || "Untitled"}</h1>
          <StatusBadge status={item.status} />
        </div>
        {item.sourceUrl ? (
          <a className="mt-2 inline-block text-sm underline" href={item.sourceUrl} rel="noreferrer">
            Open original source
          </a>
        ) : null}
      </div>
      {item.safeError ? (
        <p className="rounded-lg border border-border bg-muted-bg p-3 text-sm" role="status">
          {item.safeError}
        </p>
      ) : null}
      {item.summaryProvider === "mock" ? (
        <p className="text-sm text-warning">Deterministic demo preview. This summary is not an OpenAI response.</p>
      ) : null}
      {item.aiSummary ? (
        <Card>
          <h2 className="font-semibold">Summary</h2>
          <p className="mt-2 text-sm">{item.aiSummary}</p>
          {item.aiTakeaways.length > 0 ? (
            <ul className="mt-3 list-disc pl-5 text-sm">
              {item.aiTakeaways.map((takeaway) => (
                <li key={takeaway}>{takeaway}</li>
              ))}
            </ul>
          ) : null}
          <p className="mt-3 text-xs text-muted">Summary version {item.summaryVersion}. Suggestions are not facts and are not agreement.</p>
        </Card>
      ) : null}
      {suggestions.length > 0 ? (
        <Card>
          <h2 className="font-semibold">Suggested topics</h2>
          <ul className="mt-3 grid gap-2">
            {suggestions.map((topic) => (
              <li key={topic.name} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  {topic.name}
                  <span className="text-muted"> — {topic.reason}</span>
                </span>
                <form action={acceptTopic}>
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="name" value={topic.name} />
                  <Button type="submit" size="sm" variant="secondary">
                    Accept
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <Card>
        <form action={updateNote} className="grid gap-3">
          <input type="hidden" name="id" value={item.id} />
          <div className="grid gap-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" defaultValue={item.title ?? ""} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="note">Why I saved this</Label>
            <Textarea id="note" name="note" defaultValue={item.userNote ?? ""} data-testid="note-input" />
          </div>
          <Button type="submit" data-testid="note-save">
            Save note
          </Button>
        </form>
      </Card>
      <Card>
        <form action={assignProjects} className="grid gap-3">
          <input type="hidden" name="id" value={item.id} />
          <fieldset>
            <legend className="text-sm font-medium">Projects</legend>
            <div className="mt-2 grid gap-2">
              {projects.map((project) => (
                <label key={project.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="projectId"
                    value={project.id}
                    defaultChecked={item.projects.some((assigned) => assigned.id === project.id)}
                    data-testid="project-assign"
                  />
                  {project.name}
                  {project.status === "archived" ? " (archived)" : ""}
                </label>
              ))}
            </div>
          </fieldset>
          <Button type="submit" variant="secondary" data-testid="project-save">
            Update projects
          </Button>
        </form>
      </Card>
      <Card>
        <h2 className="font-semibold">Original text</h2>
        {source ? <pre className="mt-3 whitespace-pre-wrap font-sans text-sm">{source}</pre> : <p className="mt-2 text-sm text-muted">No source text yet.</p>}
        {item.author || item.publishedAt ? (
          <p className="mt-3 text-xs text-muted">
            {item.author ? `Author from the page: ${item.author}. ` : ""}
            {item.publishedAt ? `Published: ${formatWhen(item.publishedAt)}.` : ""}
          </p>
        ) : null}
      </Card>
      {(item.status === "needs_content" || item.status === "failed" || !source) && (
        <Card>
          <form action={pasteContent} className="grid gap-3">
            <input type="hidden" name="id" value={item.id} />
            <Label htmlFor="paste">Paste the content</Label>
            <Textarea id="paste" name="text" data-testid="paste-fallback" />
            <Button type="submit">Save pasted text</Button>
          </form>
        </Card>
      )}
      <div className="flex flex-wrap gap-2">
        <form action={retryItem}>
          <input type="hidden" name="id" value={item.id} />
          <Button type="submit" variant="secondary">
            Retry processing
          </Button>
        </form>
        <form action={removeItem}>
          <input type="hidden" name="id" value={item.id} />
          <label className="mr-2 text-sm">
            <input className="mr-2" type="checkbox" name="confirm" value="yes" data-testid="delete-confirm" />
            Delete this save and its derived answers
          </label>
          <Button type="submit" variant="danger" data-testid="delete-item">
            Delete
          </Button>
        </form>
      </div>
    </article>
  );
}
