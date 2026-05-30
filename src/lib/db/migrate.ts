/**
 * Standalone migration script — run with: pnpm db:migrate
 */
import { runMigrations } from "./index";

async function main() {
  console.log("Running database migrations...");
  await runMigrations();
  console.log("Migrations complete.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
