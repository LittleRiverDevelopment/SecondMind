import { createTopicAction, deleteTopicAction, mergeTopicAction, renameTopicAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pageContext } from "@/lib/page";

export default async function TopicsPage() {
  const { store } = await pageContext();
  const topics = await store.listTopics();
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Topics</h1>
        <p className="mt-1 text-sm text-muted">Suggested labels stay unconfirmed until you accept them on a save.</p>
      </div>
      <form action={createTopicAction} className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1.5">
          <Label htmlFor="name">New topic</Label>
          <Input id="name" name="name" required />
        </div>
        <Button type="submit">Create</Button>
      </form>
      <ul className="grid gap-3">
        {topics.map((topic) => (
          <li key={topic.id} className="rounded-xl border border-border p-3">
            <form action={renameTopicAction} className="flex flex-wrap gap-2">
              <input type="hidden" name="id" value={topic.id} />
              <Input name="name" defaultValue={topic.name} aria-label={`Rename ${topic.name}`} />
              <Button type="submit" variant="secondary">Rename</Button>
            </form>
            <form action={deleteTopicAction} className="mt-2">
              <input type="hidden" name="id" value={topic.id} />
              <Button type="submit" variant="ghost" size="sm">Remove</Button>
            </form>
          </li>
        ))}
      </ul>
      {topics.length >= 2 ? (
        <form action={mergeTopicAction} className="grid gap-3 rounded-2xl border border-border p-4 md:grid-cols-3">
          <label className="grid gap-1 text-sm">
            Merge
            <select className="h-10 rounded-lg border border-border bg-card px-2" name="sourceId" defaultValue={topics[0]?.id}>
              {topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Into
            <select className="h-10 rounded-lg border border-border bg-card px-2" name="targetId" defaultValue={topics[1]?.id}>
              {topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}
            </select>
          </label>
          <Button className="self-end" type="submit" variant="secondary">Merge</Button>
        </form>
      ) : null}
    </div>
  );
}
