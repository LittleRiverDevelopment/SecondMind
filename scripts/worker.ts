import { getStore } from "../lib/db";
import { loadConfig } from "../lib/config";
import { createProvider } from "../lib/ai/provider";
import { processJob } from "../lib/processing/pipeline";

async function main() {
  const config = loadConfig();
  if (!config.ok) {
    console.error(config.reason);
    process.exit(1);
  }
  const store = await getStore();
  const provider = createProvider(config);
  for (;;) {
    const job = await store.leaseNext();
    if (!job) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      continue;
    }
    try {
      await processJob(store, job, { provider });
      console.info("job finished", { jobId: job.id, itemId: job.itemId });
    } catch (error) {
      console.error("job failed", { jobId: job.id, name: error instanceof Error ? error.name : "Error" });
      await store.failAttempt(job, "Processing failed. You can retry it.");
    }
  }
}

void main();
