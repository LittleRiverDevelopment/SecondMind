import Link from "next/link";
import { createProject } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { pageContext } from "@/lib/page";

export default async function ProjectsPage() {
  const { store } = await pageContext();
  const projects = await store.listProjects();
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Projects</h1>
        <p className="mt-1 text-sm text-muted">A project describes what you are working on. That description is an instruction, not evidence.</p>
      </div>
      <form action={createProject} className="grid gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="grid gap-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" required data-testid="project-name" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" name="description" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="researchQuestion">Current question</Label>
          <Input id="researchQuestion" name="researchQuestion" />
        </div>
        <Button type="submit">Create project</Button>
      </form>
      <ul className="grid gap-2">
        {projects.map((project) => (
          <li key={project.id}>
            <Link className="block rounded-xl border border-border px-3 py-2" href={`/projects/${project.id}`}>
              {project.name}
              <span className="ml-2 text-xs text-muted">{project.status}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
