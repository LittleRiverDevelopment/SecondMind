import Link from "next/link";
import { generateDigest } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatWhen, pageContext } from "@/lib/page";

export default async function DigestsPage() {
  const { store } = await pageContext();
  const [digests, projects, topics] = await Promise.all([store.listDigests(), store.listProjects(), store.listTopics()]);
  const end = new Date();
  // The default range is the previous seven days at request time.
  // eslint-disable-next-line react-hooks/purity
  const start = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Digests</h1>
        <p className="mt-1 text-sm text-muted">On demand, for a date range. Nothing is emailed.</p>
      </div>
      <form action={generateDigest} className="grid gap-3 rounded-2xl border border-border bg-card p-4 md:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="from">From</Label>
          <input id="from" className="h-10 rounded-lg border border-border bg-card px-2 text-sm" type="date" name="from" defaultValue={start.toISOString().slice(0, 10)} required data-testid="digest-from" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="to">To</Label>
          <input id="to" className="h-10 rounded-lg border border-border bg-card px-2 text-sm" type="date" name="to" defaultValue={end.toISOString().slice(0, 10)} required data-testid="digest-to" />
        </div>
        <select className="h-10 rounded-lg border border-border bg-card px-2 text-sm" name="projectId" aria-label="Project" defaultValue="">
          <option value="">Any project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>{project.name}</option>
          ))}
        </select>
        <select className="h-10 rounded-lg border border-border bg-card px-2 text-sm" name="topicId" aria-label="Topic" defaultValue="">
          <option value="">Any topic</option>
          {topics.map((topic) => (
            <option key={topic.id} value={topic.id}>{topic.name}</option>
          ))}
        </select>
        <Button type="submit" data-testid="digest-generate">Generate digest</Button>
      </form>
      <ul className="grid gap-2">
        {digests.length === 0 ? <li className="text-sm text-muted">No digests yet.</li> : null}
        {digests.map((digest) => (
          <li key={digest.id}>
            <Link className="block rounded-xl border border-border px-3 py-2" href={`/digests/${digest.id}`}>
              {digest.rangeStart} to {digest.rangeEnd}
              <span className="ml-2 text-xs text-muted">{formatWhen(digest.createdAt)}{digest.invalidated ? " · removed" : ""}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
