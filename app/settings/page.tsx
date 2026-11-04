import { deleteEverything } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pageContext } from "@/lib/page";

export default async function SettingsPage() {
  const { config, store } = await pageContext();
  const stats = await store.stats();
  const usageKnown = stats.usage.some((row) => row.inputTokens != null || row.outputTokens != null);
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted">Mode: {config.mode}. Database: {config.dataDriver}.</p>
      </div>
      <section className="rounded-2xl border border-border bg-card p-4 text-sm">
        <h2 className="font-semibold">AI</h2>
        <p className="mt-2">Provider: {config.ai === "unconfigured" ? "not configured" : config.ai}.</p>
        <p>Extraction model setting: {config.extractionModel}.</p>
        <p>Answer model setting: {config.answerModel}.</p>
        <p>Embedding model setting: {config.embeddingModel}.</p>
        <p>API key {config.openAiKey ? "is set on the server" : "is not set"}. The key is never shown here.</p>
        <p className="mt-3 text-muted">
          When a real model is configured, saved source text, your question, and optional project instructions are sent to that provider to summarize, embed, answer, or draft a digest. Demo mode does not send anything. Deleting a save removes it from this app. It does not delete records the provider may already have stored.
        </p>
        {config.ai === "mock" ? <p className="mt-2 text-warning">Outputs are deterministic previews, not model responses.</p> : null}
      </section>
      <section className="rounded-2xl border border-border bg-card p-4 text-sm">
        <h2 className="font-semibold">Processing</h2>
        <p className="mt-2">{stats.items} saves.</p>
        <ul className="mt-2">
          {Object.entries(stats.jobs).map(([status, count]) => (
            <li key={status}>{status}: {count}</li>
          ))}
        </ul>
        <h3 className="mt-4 font-medium">Recent model usage</h3>
        {!usageKnown ? <p className="text-muted">No token counts have been reported.</p> : null}
        <ul>
          {stats.usage.map((row, index) => (
            <li key={`${row.createdAt}-${index}`}>
              {row.kind} · {row.provider}
              {row.inputTokens != null ? ` · in ${row.inputTokens}` : ""}
              {row.outputTokens != null ? ` · out ${row.outputTokens}` : ""}
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-semibold">Export</h2>
        <p className="mt-2 text-sm text-muted">Original content, notes, topics, and projects. Summaries, chats, and embeddings stay out of the file.</p>
        <a className="mt-3 inline-flex h-10 items-center rounded-lg bg-accent px-3 text-sm text-accent-foreground" href="/api/export" data-testid="export-link">
          Download JSON
        </a>
      </section>
      <section className="rounded-2xl border border-danger p-4">
        <h2 className="font-semibold">Delete everything</h2>
        <p className="mt-2 text-sm text-muted">Removes saves, topics, projects, and redacts chats and digests in this app.</p>
        <form action={deleteEverything} className="mt-3 grid max-w-sm gap-2">
          <Label htmlFor="confirm">Type DELETE</Label>
          <Input id="confirm" name="confirm" data-testid="delete-all-confirm" />
          <Button type="submit" variant="danger" data-testid="delete-all-submit">Delete all data</Button>
        </form>
      </section>
    </div>
  );
}
