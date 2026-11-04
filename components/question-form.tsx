import { ask } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function QuestionForm({
  projects,
  topics,
  sessionId,
}: {
  projects: { id: string; name: string }[];
  topics: { id: string; name: string }[];
  sessionId?: string;
}) {
  return (
    <form action={ask} className="grid gap-3 rounded-2xl border border-border bg-card p-4">
      {sessionId ? <input type="hidden" name="sessionId" value={sessionId} /> : null}
      <div className="grid gap-1.5">
        <Label htmlFor="question">Question</Label>
        <Textarea id="question" name="question" required data-testid="chat-question" />
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <select className="h-10 rounded-lg border border-border bg-card px-2 text-sm" name="projectId" aria-label="Limit to project" defaultValue="">
          <option value="">Any project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
        <select className="h-10 rounded-lg border border-border bg-card px-2 text-sm" name="topicId" aria-label="Limit to topic" defaultValue="">
          <option value="">Any topic</option>
          {topics.map((topic) => (
            <option key={topic.id} value={topic.id}>
              {topic.name}
            </option>
          ))}
        </select>
        <input className="h-10 rounded-lg border border-border bg-card px-2 text-sm" type="date" name="from" aria-label="From" />
        <input className="h-10 rounded-lg border border-border bg-card px-2 text-sm" type="date" name="to" aria-label="To" />
      </div>
      <Button type="submit" data-testid="chat-submit">
        Ask
      </Button>
    </form>
  );
}
