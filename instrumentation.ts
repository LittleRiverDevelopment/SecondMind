export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const { startInlineWorker } = await import("@/lib/processing/worker");
  startInlineWorker();
}
