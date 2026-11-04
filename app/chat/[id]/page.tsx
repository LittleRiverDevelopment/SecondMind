import Link from "next/link";
import { QuestionForm } from "@/components/question-form";
import { formatWhen, pageContext } from "@/lib/page";

export default async function ChatSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { store } = await pageContext();
  const session = await store.getSession(id);
  if (!session) return <p>That chat is not available.</p>;
  const [messages, projects, topics] = await Promise.all([
    store.listMessages(id),
    store.listProjects(),
    store.listTopics(),
  ]);
  const citedIds = [...new Set(messages.flatMap((message) => message.citations.map((citation) => citation.itemId)))];
  const cited = new Map(
    (await Promise.all(citedIds.map(async (itemId) => [itemId, await store.getItem(itemId)] as const))).filter((entry) => entry[1]),
  );
  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{session.title}</h1>
        <p className="text-sm text-muted">{formatWhen(session.createdAt)}</p>
      </div>
      <ol className="grid gap-3">
        {messages.map((message) => (
          <li key={message.id} className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted">{message.role}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm" data-testid={message.role === "assistant" ? "chat-answer" : undefined}>
              {message.body}
            </p>
            {message.provider === "mock" && message.role === "assistant" && !message.invalidated ? (
              <p className="mt-2 text-xs text-warning">Demo preview, not a model response.</p>
            ) : null}
            {message.insufficient ? <p className="mt-2 text-xs text-muted">Not enough saved evidence.</p> : null}
            {message.citations.length > 0 ? (
              <ul className="mt-3 grid gap-1 text-sm">
                {message.citations.map((citation) => {
                  const item = cited.get(citation.itemId);
                  if (!item) return null;
                  return (
                    <li key={citation.chunkId}>
                      <Link className="underline" href={`/items/${item.id}`} data-testid="citation-link">
                        {item.title || "Untitled"}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {message.inferred.length > 0 ? (
              <div className="mt-3 text-sm">
                <p className="font-medium">Inferred connections</p>
                <ul className="list-disc pl-5">{message.inferred.map((line) => <li key={line}>{line}</li>)}</ul>
              </div>
            ) : null}
            {message.applications.length > 0 ? (
              <div className="mt-3 text-sm">
                <p className="font-medium">Suggestions, not source claims</p>
                <ul className="list-disc pl-5">{message.applications.map((line) => <li key={line}>{line}</li>)}</ul>
              </div>
            ) : null}
          </li>
        ))}
      </ol>
      <QuestionForm projects={projects} topics={topics} sessionId={session.id} />
    </div>
  );
}
