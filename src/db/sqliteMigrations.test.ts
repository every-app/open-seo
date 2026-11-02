import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { sort } from "remeda";
import { describe, expect, it } from "vitest";

/**
 * D1 keeps foreign keys on inside a migration and ignores drizzle-kit's
 * `PRAGMA foreign_keys=OFF`, so a table rebuild's `DROP TABLE x` deletes every
 * row of x's ON DELETE CASCADE children (and blanks SET NULL keys). See
 * docs/maintainers/sqlite-migrations.md for how to write such a migration.
 */

// The same line Every App's CLI accepts, so one marker works on both.
const ALLOW_MARKER = "-- everyapp: allow-cascading-drop";

// Written before this check; they have already run and cannot change.
const GRANDFATHERED = ["0003_light_sage.sql"];

const DROP_TABLE =
  /^\s*DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?[`"[]?(\w+)[`"\]]?/gim;
const ROW_ACTIONS = new Set(["CASCADE", "SET NULL", "SET DEFAULT"]);

type Migration = { name: string; sql: string };
type CascadingDrop = { migration: string; table: string; affected: string[] };

/**
 * Applies the migrations in order to an in-memory SQLite and, before each
 * DROP TABLE, lists the tables whose rows the drop would delete or change on
 * D1. Tables the migration inserts into after the drop (copied aside and put
 * back) don't count.
 */
function findCascadingDrops(migrations: Migration[]): CascadingDrop[] {
  const database = new DatabaseSync(":memory:");
  const found: CascadingDrop[] = [];
  for (const { name, sql } of migrations) {
    const allowed = sql
      .split("\n")
      .some((line) => line.trim() === ALLOW_MARKER);
    const chunks = sql.split("--> statement-breakpoint");
    chunks.forEach((chunk, index) => {
      for (const drop of chunk.matchAll(DROP_TABLE)) {
        const table = drop[1].toLowerCase();
        const rest = [chunk.slice(drop.index), ...chunks.slice(index + 1)].join(
          "\n",
        );
        const affected = affectedBy(database, table).filter(
          (child) => !insertsInto(rest, child),
        );
        if (affected.length > 0 && !allowed)
          found.push({ migration: name, table, affected });
      }
      database.exec(chunk);
    });
  }
  return found;
}

/** Tables whose rows dropping `table` deletes or changes, through CASCADE. */
function affectedBy(database: DatabaseSync, table: string): string[] {
  const keys = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .flatMap(({ name }) =>
      database
        .prepare(
          'SELECT "table" AS parent, on_delete AS action FROM pragma_foreign_key_list(?)',
        )
        .all(String(name))
        .map((key) => ({
          child: String(name).toLowerCase(),
          parent: String(key.parent).toLowerCase(),
          action: String(key.action).toUpperCase(),
        })),
    );
  const affected = new Set<string>();
  const visit = (parent: string) => {
    for (const key of keys) {
      if (key.parent !== parent || key.child === table) continue;
      if (!ROW_ACTIONS.has(key.action) || affected.has(key.child)) continue;
      affected.add(key.child);
      if (key.action === "CASCADE") visit(key.child);
    }
  };
  visit(table);
  return [...affected];
}

function insertsInto(sql: string, table: string): boolean {
  return new RegExp(
    String.raw`\b(?:INSERT(?:\s+OR\s+\w+)?|REPLACE)\s+INTO\s+[\x60"[]?${table}\b`,
    "i",
  ).test(sql);
}

describe("sqlite migrations", () => {
  it("never drop a table whose children's rows D1 would delete", () => {
    const names = sort(
      readdirSync("drizzle/sqlite").filter((file) => file.endsWith(".sql")),
      (a, b) => a.localeCompare(b),
    );
    const found = findCascadingDrops(
      names.map((name) => ({
        name,
        sql: readFileSync(`drizzle/sqlite/${name}`, "utf8"),
      })),
    );

    expect(
      found
        .filter((drop) => !GRANDFATHERED.includes(drop.migration))
        .map(
          (drop) =>
            `${drop.migration}: DROP TABLE ${drop.table} deletes or blanks rows of ${drop.affected.join(", ")} on D1. Follow docs/maintainers/sqlite-migrations.md, or add the line "${ALLOW_MARKER}" if that is intended.`,
        ),
    ).toEqual([]);
    expect([...new Set(found.map((drop) => drop.migration))]).toEqual(
      GRANDFATHERED,
    );
  });

  it("accepts a rebuild that copies the children aside and back", () => {
    const base = {
      name: "0000.sql",
      sql: `CREATE TABLE parent (id text PRIMARY KEY, name text);
CREATE TABLE child (id text PRIMARY KEY, parent_id text REFERENCES parent(id) ON DELETE CASCADE);`,
    };
    const rebuild = `CREATE TABLE __new_parent (id text PRIMARY KEY, name text NOT NULL);--> statement-breakpoint
INSERT INTO __new_parent SELECT id, coalesce(name, '') FROM parent;--> statement-breakpoint
DROP TABLE parent;--> statement-breakpoint
ALTER TABLE __new_parent RENAME TO parent;`;
    const restored = `CREATE TABLE __keep_child AS SELECT * FROM child;--> statement-breakpoint
${rebuild}--> statement-breakpoint
INSERT OR REPLACE INTO child SELECT * FROM __keep_child;--> statement-breakpoint
DROP TABLE __keep_child;`;

    expect(
      findCascadingDrops([base, { name: "0001.sql", sql: rebuild }]),
    ).toEqual([
      { migration: "0001.sql", table: "parent", affected: ["child"] },
    ]);
    expect(
      findCascadingDrops([base, { name: "0001.sql", sql: restored }]),
    ).toEqual([]);
  });
});
