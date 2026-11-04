import Link from "next/link";
import { pageContext } from "@/lib/page";

export default async function DigestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { store } = await pageContext();
  const digest = await store.getDigest(id);
  if (!digest) return <p>That digest is not available.</p>;
  const ids = [
    ...digest.body.themes.flatMap((section) => section.itemIds),
    ...digest.body.takeaways.flatMap((section) => section.itemIds),
    ...digest.body.connections.flatMap((section) => section.itemIds),
    ...digest.body.applications.flatMap((section) => section.itemIds),
  ];
  const items = new Map(
    (await Promise.all([...new Set(ids)].map(async (itemId) => [itemId, await store.getItem(itemId)] as const))).filter((entry) => entry[1]),
  );
  return (
    <article className="grid gap-4" data-testid="digest-body">
      <h1 className="text-3xl font-semibold tracking-tight">
        {digest.rangeStart} to {digest.rangeEnd}
      </h1>
      {digest.invalidated ? <p className="text-sm text-warning">A cited source was deleted, so the previous text was removed.</p> : null}
      {digest.provider === "mock" && !digest.invalidated ? (
        <p className="text-sm text-warning">Demo preview, not a model response.</p>
      ) : null}
      <Section title="Themes" sections={digest.body.themes} items={items} />
      <Section title="Takeaways" sections={digest.body.takeaways} items={items} />
      <Section title="Connections to older saves" sections={digest.body.connections} items={items} />
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-semibold">Possible applications</h2>
        <p className="mt-1 text-xs text-muted">Suggestions only. Project notes are instructions, not evidence.</p>
        {digest.body.applications.length === 0 ? <p className="mt-2 text-sm text-muted">None.</p> : null}
        <ul className="mt-2 grid gap-2 text-sm">
          {digest.body.applications.map((section) => (
            <li key={section.text}>
              {section.text}
              <ItemLinks ids={section.itemIds} items={items} />
            </li>
          ))}
        </ul>
      </section>
      {digest.body.gaps.length > 0 ? (
        <section>
          <h2 className="font-semibold">Gaps</h2>
          <ul className="mt-2 list-disc pl-5 text-sm">{digest.body.gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul>
        </section>
      ) : null}
    </article>
  );
}

function Section({
  title,
  sections,
  items,
}: {
  title: string;
  sections: { text: string; itemIds: string[] }[];
  items: Map<string, { id: string; title: string | null } | null | undefined>;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="font-semibold">{title}</h2>
      {sections.length === 0 ? <p className="mt-2 text-sm text-muted">None.</p> : null}
      <ul className="mt-2 grid gap-2 text-sm">
        {sections.map((section) => (
          <li key={section.text}>
            {section.text}
            <ItemLinks ids={section.itemIds} items={items} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ItemLinks({
  ids,
  items,
}: {
  ids: string[];
  items: Map<string, { id: string; title: string | null } | null | undefined>;
}) {
  const links = ids.flatMap((id) => {
    const item = items.get(id);
    return item ? [item] : [];
  });
  if (links.length === 0) return null;
  return (
    <span className="ml-2">
      {links.map((item) => (
        <Link key={item.id} className="mr-2 underline" href={`/items/${item.id}`} data-testid="digest-citation">
          {item.title || "Untitled"}
        </Link>
      ))}
    </span>
  );
}
