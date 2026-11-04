import { loadConfig } from "@/lib/config";
import { getStore, markWorkerStarted } from "@/lib/db";
import { createProvider } from "@/lib/ai/provider";
import { processJob } from "@/lib/processing/pipeline";

let running = false;

export async function runOnce() {
  if (running) return false;
  running = true;
  try {
    const config = loadConfig();
    if (!config.ok) return false;
    const store = await getStore();
    const job = await store.leaseNext();
    if (!job) return false;
    try {
      await processJob(store, job, { provider: createProvider(config) });
    } catch (error) {
      console.error("processing failed", { jobId: job.id, name: error instanceof Error ? error.name : "Error" });
      await store.failAttempt(job, "Processing failed. You can retry it.");
    }
    return true;
  } finally {
    running = false;
  }
}

export function startInlineWorker() {
  const config = loadConfig();
  if (!config.ok || !config.inlineWorker) return;
  if (!markWorkerStarted()) return;
  const timer = setInterval(() => {
    void runOnce();
  }, 1000);
  timer.unref?.();
}
