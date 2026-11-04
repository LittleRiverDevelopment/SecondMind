import type { ChunkHit } from "@/lib/db/types";

export function fuseRrf(lists: string[][], k = 60) {
  const scores = new Map<string, number>();
  for (const list of lists) {
    list.forEach((id, index) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1));
    });
  }
  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((left, right) => right.score - left.score);
}

export function fuseChunkHits(lists: ChunkHit[][], limit: number, charLimit: number) {
  const fused = fuseRrf(lists.map((list) => list.map((hit) => hit.chunkId)));
  const byId = new Map<string, ChunkHit>();
  for (const list of lists) {
    for (const hit of list) if (!byId.has(hit.chunkId)) byId.set(hit.chunkId, hit);
  }
  const chosen: ChunkHit[] = [];
  const seenItems = new Set<string>();
  let chars = 0;
  for (const row of fused) {
    const hit = byId.get(row.id);
    if (!hit || seenItems.has(hit.itemId)) continue;
    if (chars + hit.text.length > charLimit && chosen.length > 0) break;
    chars += hit.text.length;
    seenItems.add(hit.itemId);
    chosen.push(hit);
    if (chosen.length >= limit) break;
  }
  return chosen;
}
