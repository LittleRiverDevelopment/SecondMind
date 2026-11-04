import Link from "next/link";
import { QuestionForm } from "@/components/question-form";
import { formatWhen, pageContext } from "@/lib/page";

export default async function ChatPage() {
  const { store } = await pageContext();
  const [sessions, projects, topics] = await Promise.all([store.listSessions(), store.listProjects(), store.listTopics()]);
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Chat</h1>
        <p className="mt-1 text-sm text-muted">Questions stay inside the library. Answers cite saved items or say the evidence is not enough.</p>
      </div>
      <QuestionForm projects={projects} topics={topics} />
      <ul className="grid gap-2">
        {sessions.length === 0 ? <li className="text-sm text-muted">No questions yet.</li> : null}
        {sessions.map((session) => (
          <li key={session.id}>
            <Link className="block rounded-xl border border-border px-3 py-2 hover:border-accent" href={`/chat/${session.id}`}>
              {session.title}
              <span className="ml-2 text-xs text-muted">{formatWhen(session.createdAt)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
