import { rmSync } from "node:fs";
import path from "node:path";
import { createReadyStore } from "../lib/db/index";
import { createClosablePglite } from "../lib/db/sql";

async function main() {
  const dir = path.join(process.cwd(), "data", "demo-cluster");
  process.env.APP_MODE = "demo";
  process.env.PGLITE_DIR = dir;
  delete process.env.CLONE_DEMO_CLUSTER;

  const db = await createClosablePglite(dir);
  await createReadyStore(db.sql);
  await db.checkpoint();
  await db.close();
  rmSync(path.join(dir, "postmaster.pid"), { force: true });
  console.log(`prepared ${dir}`);
}

main();
