"use client";

import { useActionState } from "react";
import { capture, type CaptureState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function CaptureForm({ projects }: { projects: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<CaptureState, FormData>(capture, {});
  return (
    <form action={action} className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="capture-url">URL</Label>
          <Input id="capture-url" name="url" type="url" placeholder="https://…" data-testid="capture-url" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="capture-title">Title, if you already know it</Label>
          <Input id="capture-title" name="title" data-testid="capture-title" />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="capture-text">Pasted text</Label>
        <Textarea id="capture-text" name="text" placeholder="Paste a post, article, or note" data-testid="capture-text" />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="capture-note">Why I saved this</Label>
          <Input id="capture-note" name="note" data-testid="capture-note" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="capture-topics">Topics</Label>
          <Input id="capture-topics" name="topics" placeholder="retention, onboarding" data-testid="capture-topics" />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="capture-project">Project</Label>
        <select
          id="capture-project"
          name="projectId"
          data-testid="capture-project"
          className="h-10 rounded-lg border border-border bg-card px-3 text-sm"
          defaultValue=""
        >
          <option value="">No project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </div>
      {state.error ? (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.duplicateId ? (
        <div className="rounded-lg border border-border bg-muted-bg p-3 text-sm" role="status">
          <p>This matches an existing save: {state.duplicateTitle || "Untitled"}.</p>
          <a className="underline" href={`/items/${state.duplicateId}`} data-testid="duplicate-link">
            Open the existing item
          </a>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" data-testid="capture-submit" disabled={pending}>
          {pending ? "Saving…" : "Save something"}
        </Button>
        {state.duplicateId ? (
          <Button type="submit" name="force" value="yes" variant="secondary">
            Save another copy
          </Button>
        ) : null}
      </div>
    </form>
  );
}
