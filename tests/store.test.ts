import { describe, expect, it } from "vitest";
import { mockEmbedding } from "@/lib/ai/mock";
import { createMockProvider } from "@/lib/ai/provider";
import { processJob } from "@/lib/processing/pipeline";
import { testStore } from "./helpers";

describe("saved items", () => {
  it("stores pasted text and finds an exact duplicate", async () => {
    const { store } = await testStore();
    const first = await store.createItem({
      sourceUrl: "https://Example.com/A?id=1",
      urlKey: "https://Example.com/A?id=1",
      contentHash: "abc",
      originalInput: { url: "https://Example.com/A?id=1", text: "Hello from the source." },
      userPastedText: "Hello from the source.",
      title: "First",
      userNote: "why",
      topicIds: [],
      projectId: null,
    });
    const duplicate = await store.findDuplicate("https://Example.com/A?id=1", null);
    const different = await store.findDuplicate("https://example.com/A?id=1", null);
    expect(duplicate?.id).toBe(first.id);
    expect(different).toBeNull();
    expect(first.userNote).toBe("why");
    expect(first.originalInput.text).toContain("Hello");
    const exported = await store.exportData();
    expect(exported.items.map((item) => item.title)).toEqual(["First"]);
    expect(exported.items[0]?.note).toBe("why");
    expect(exported.items[0]?.pastedText).toContain("Hello");
    expect(JSON.stringify(exported)).not.toMatch(/ai_summary|aiSummary|embedding/);
  });

  it("hides another owner's rows", async () => {
    const { store, other } = await testStore();
    await store.createItem({
      sourceUrl: null,
      urlKey: null,
      contentHash: null,
      originalInput: { text: "Owner A private note about retention checklists and renewals." },
      userPastedText: "Owner A private note about retention checklists and renewals.",
      title: "Private",
      userNote: null,
      topicIds: [],
      projectId: null,
    });
    expect(await other.listItems()).toEqual([]);
    expect((await store.listItems()).length).toBe(1);
  });

  it("moves pasted text to ready without doubling chunks", async () => {
    const { store } = await testStore();
    const item = await store.createItem({
      sourceUrl: null,
      urlKey: null,
      contentHash: null,
      originalInput: { text: "Users who completed a checklist in week one renewed more often. This sentence is long enough to process." },
      userPastedText: "Users who completed a checklist in week one renewed more often. This sentence is long enough to process.",
      title: null,
      userNote: "Because the checklist idea matters",
      topicIds: [],
      projectId: null,
    });
    const provider = createMockProvider();
    const first = await store.leaseNext();
    expect(first?.itemId).toBe(item.id);
    await processJob(store, first!, { provider });
    const ready = await store.getItem(item.id);
    expect(ready?.status).toBe("ready");
    expect(ready?.summaryProvider).toBe("mock");
    expect(ready?.aiSummary).toMatch(/checklist/i);
    expect(ready?.userNote).toBe("Because the checklist idea matters");
    const again = await store.retry(item.id);
    expect(again).toBeUndefined();
    const second = await store.leaseNext();
    await processJob(store, second!, { provider });
    const hits = await store.semanticHits(mockEmbedding("checklist renewed"), {});
    expect(hits.filter((hit) => hit.itemId === item.id).length).toBeGreaterThan(0);
    const keyword = await store.keywordHits("checklist", {});
    expect(keyword.some((hit) => hit.itemId === item.id)).toBe(true);
  });
});
