// Alchemy 2 rejects drizzle-kit's v0 migration layout (the `meta/_journal.json`
// that `drizzle/sqlite` carries) and only accepts a flat directory of `.sql`
// files or drizzle-kit v1 directories. wrangler (`db:migrate:*`) and
// drizzle-kit (`db:generate:*`) still need the v0 layout, so this copies just
// the `.sql` files into a flat, gitignored directory for alchemy to read.
//
// Run automatically before every `pnpm alchemy` invocation (see the `alchemy`
// script in package.json); safe to re-run.
import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";

const SOURCE = "drizzle/sqlite";
const DESTINATION = ".alchemy-migrations/sqlite";

rmSync(DESTINATION, { recursive: true, force: true });
mkdirSync(DESTINATION, { recursive: true });

const sqlFiles = readdirSync(SOURCE).filter((name) => name.endsWith(".sql"));
for (const name of sqlFiles) {
  cpSync(`${SOURCE}/${name}`, `${DESTINATION}/${name}`);
}

console.log(
  `Prepared ${sqlFiles.length} D1 migration(s) for alchemy in ${DESTINATION}`,
);
