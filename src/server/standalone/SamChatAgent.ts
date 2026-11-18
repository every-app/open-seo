import { SamChatAgent } from "@/server/features/sam/SamChatAgent";
import { importRowsSchema } from "./import-schema";

// Think's conversation storage, as copied by the legacy Docker import.
const LEGACY_HISTORY_TABLES = [
  "assistant_messages",
  "assistant_compactions",
  "assistant_config",
  "assistant_fts",
];

// The standalone build's SAM object: the hosted class plus the operator-only
// RPC the legacy Docker import uses (src/server/standalone/import.ts). Neither
// method is decorated @callable, so clients can never reach them. Import
// preserves the logical conversation tree, compactions and config, without
// restoring pending turns, tool executions or alarms.
export class StandaloneSamChatAgent extends SamChatAgent {
  async legacyHistoryCounts() {
    const counts: Record<string, number> = {};
    for (const table of LEGACY_HISTORY_TABLES) {
      counts[table] = this.ctx.storage.sql
        .exec<{ n: number }>(`SELECT count(*) AS n FROM "${table}"`)
        .one().n;
    }
    return counts;
  }

  async importLegacyHistory(input: unknown) {
    const data = importRowsSchema.parse(input);
    if (!LEGACY_HISTORY_TABLES.includes(data.table)) {
      throw new Error("Unsupported history table");
    }
    const columns = this.ctx.storage.sql
      .exec<{ name: string }>(`PRAGMA table_info("${data.table}")`)
      .toArray();
    if (
      data.columns.some(
        (name) => !columns.some((column) => column.name === name),
      )
    ) {
      throw new Error("History schema mismatch");
    }
    this.ctx.storage.transactionSync(() => {
      for (const row of data.rows) {
        if (row.length !== data.columns.length) {
          throw new Error("History row mismatch");
        }
        if (data.table === "assistant_fts") {
          this.ctx.storage.sql.exec(
            "DELETE FROM assistant_fts WHERE id = ?",
            row[data.columns.indexOf("id")],
          );
        }
        this.ctx.storage.sql.exec(
          `INSERT OR REPLACE INTO "${data.table}" (${data.columns.map((name) => `"${name}"`).join(",")}) VALUES (${data.columns.map(() => "?").join(",")})`,
          ...row,
        );
      }
    });
  }
}
