import { loadConfig } from "../lib/config";
import { migrate, openPostgres } from "../lib/db/sql";

async function main() {
  const config = loadConfig();
  if (!config.ok) {
    console.error(config.reason);
    process.exit(1);
  }
  if (!config.databaseUrl) {
    console.error("DATABASE_URL is not set. PGlite migrates itself when the app starts.");
    process.exit(1);
  }
  const sql = openPostgres(config.databaseUrl);
  await migrate(sql);
  console.info("migrations applied");
  process.exit(0);
}

void main();
