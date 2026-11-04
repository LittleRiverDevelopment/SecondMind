import Link from "next/link";
import { refreshProjectBrief, updateProject } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatWhen, pageContext } from "@/lib/page";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { store } = await pageContext();
  const project = await store.getProject(id);
  if (!project) return <p>That project is not available.</p>;
  const [items, brief] = await Promise.all([store.listItems({ projectId: id, limit: 50 }), store.getBrief(id)]);
  return (
    <div className="grid gap-5">
      <h1 className="text-3xl font-semibold tracking-tight">{project.name}</h1>
      <form action={updateProject} className="grid gap-3 rounded-2xl border border-border bg-card p-4">
        <input type="hidden" name="id" value={project.id} />
        <div className="grid gap-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" defaultValue={project.name} required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" name="description" defaultValue={project.description} />
          <p className="text-xs text-muted">Used to shape answers and digests. It is not treated as a source.</p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="researchQuestion">Current question</Label>
          <Input id="researchQuestion" name="researchQuestion" defaultValue={project.researchQuestion} />
        </div>
        <label className="text-sm">
          Status
          <select className="ml-2 h-10 rounded-lg border border-border bg-card px-2" name="status" defaultValue={project.status}>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        <Button type="submit" variant="secondary">Save project</Button>
      </form>
      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Brief</h2>
          {brief?.stale ? <span className="text-xs text-warning">Stale</span> : null}
        </div>
        {brief ? (
          <>
            <p className="mt-1 text-xs text-muted">Last refreshed {formatWhen(brief.refreshedAt)}. Refresh only when you ask.</p>
            {brief.provider === "mock" ? <p className="mt-2 text-xs text-warning">Demo preview, not a model response.</p> : null}
            <p className="mt-3 whitespace-pre-wrap text-sm">{brief.body}</p>
            <ul className="mt-3 text-sm">
              {brief.citations.map((citation) => (
                <li key={citation.itemId}>
                  <Link className="underline" href={`/items/${citation.itemId}`}>
                    Saved item
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted">No brief yet.</p>
        )}
        <form className="mt-3" action={refreshProjectBrief}>
          <input type="hidden" name="projectId" value={project.id} />
          <Button type="submit">Refresh brief</Button>
        </form>
      </section>
      <section>
        <h2 className="font-semibold">Assigned saves</h2>
        <ul className="mt-2 grid gap-2">
          {items.length === 0 ? <li className="text-sm text-muted">Nothing is assigned yet.</li> : null}
          {items.map((item) => (
            <li key={item.id}>
              <Link className="underline" href={`/items/${item.id}`}>{item.title || "Untitled"}</Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
