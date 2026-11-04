export function chunkText(text: string, size = 800, overlap = 100) {
  const paragraphs = text
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  const push = (value: string) => {
    if (value.trim() && chunks.length < 40) chunks.push(value.trim());
  };
  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n${paragraph}` : paragraph;
    if (next.length > size && current) {
      push(current);
      const tail = current.slice(Math.max(0, current.length - overlap));
      current = `${tail}\n${paragraph}`.trim();
    } else {
      current = next;
    }
  }
  push(current);
  if (chunks.length === 0 && text.trim()) push(text.trim().slice(0, size));
  return chunks.slice(0, 40);
}
