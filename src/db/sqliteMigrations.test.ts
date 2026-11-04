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
type Affected = { table: string; action: string };
type CascadingDrop = { migration: string; table: string; affected: string[] };

const NAME = String.raw`[\x60"[]?(\w+)[\x60"\]]?`;

/**
 * Applies the migrations in order to an in-memory SQLite and, before each
 * DROP TABLE, lists the tables whose rows the drop would delete or change on
 * D1. A table the migration puts back from a copy made before the drop
 * doesn't count.
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
        const before = [...chunks.slice(0, index), chunk.slice(0, drop.index)];
        const after = [chunk.slice(drop.index), ...chunks.slice(index + 1)];
        const affected = affectedBy(database, table)
          .filter((child) => !restores(before, after, child))
          .map((child) => child.table);
        if (affected.length > 0 && !allowed)
          found.push({ migration: name, table, affected });
      }
      database.exec(chunk);
    });
  }
  return found;
}

/** Tables whose rows dropping `table` deletes (CASCADE) or changes. */
function affectedBy(database: DatabaseSync, table: string): Affected[] {
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
  const affected = new Map<string, string>();
  const visit = (parent: string) => {
    for (const key of keys) {
      if (key.parent !== parent || key.child === table) continue;
      if (!ROW_ACTIONS.has(key.action)) continue;
      // A deleted row needs inserting back even if another key only blanks it.
      if (affected.get(key.child) === "CASCADE") continue;
      if (affected.has(key.child) && key.action !== "CASCADE") continue;
      affected.set(key.child, key.action);
      if (key.action === "CASCADE") visit(key.child);
    }
  };
  visit(table);
  return [...affected].map(([child, action]) => ({ table: child, action }));
}

function statements(chunks: string[]): string[] {
  return chunks
    .join(";")
    .split(";")
    .map((statement) =>
      statement
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim(),
    );
}

/**
 * Whether a statement after the drop reads a copy of `child` made before it
 * and puts the rows back the way docs/maintainers/sqlite-migrations.md says:
 * a SET NULL child's key by UPDATE (INSERT OR REPLACE would delete the row
 * and fire its own children's ON DELETE); drizzle-kit's `__new_x` copy of a
 * self-referencing table, renamed after the drop, by INSERT OR IGNORE under
 * its new name; any other child by INSERT.
 */
function restores(before: string[], after: string[], child: Affected) {
  const copies = statements(before).flatMap((statement) => {
    const copy = new RegExp(
      String.raw`^CREATE\s+TABLE\s+${NAME}\s+AS\s+SELECT\b[\s\S]*?\bFROM\s+${NAME}`,
      "i",
    ).exec(statement);
    return copy && copy[2].toLowerCase() === child.table ? [copy[1]] : [];
  });
  if (copies.length === 0) return false;
  const later = statements(after);
  let target = child.table;
  for (const statement of later) {
    const rename = new RegExp(
      String.raw`^ALTER\s+TABLE\s+${NAME}\s+RENAME\s+TO\s+${NAME}`,
      "i",
    ).exec(statement);
    if (rename && rename[1].toLowerCase() === target)
      target = rename[2].toLowerCase();
  }
  const write =
    child.action !== "CASCADE"
      ? String.raw`UPDATE(?:\s+OR\s+\w+)?\s+`
      : target !== child.table
        ? String.raw`INSERT\s+OR\s+IGNORE\s+INTO\s+`
        : String.raw`(?:INSERT(?:\s+OR\s+\w+)?|REPLACE)\s+INTO\s+`;
  const writes = new RegExp(String.raw`^${write}[\x60"[]?${target}\b`, "i");
  return later.some(
    (statement) =>
      writes.test(statement) &&
      copies.some((copy) =>
        new RegExp(String.raw`\b${copy}\b`, "i").test(statement),
      ),
  );
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

  // Each recipe from docs/maintainers/sqlite-migrations.md. `accepted` ones
  // also run as D1 runs a migration (one transaction, foreign keys on) and
  // must keep every row.
  const SCHEMA = `CREATE TABLE parent (id text PRIMARY KEY, name text);
CREATE TABLE child (id text PRIMARY KEY, parent_id text REFERENCES parent(id) ON DELETE CASCADE);
CREATE TABLE grandchild (id text PRIMARY KEY, child_id text REFERENCES child(id) ON DELETE CASCADE);
CREATE TABLE note (id text PRIMARY KEY, parent_id text REFERENCES parent(id) ON DELETE SET NULL);
CREATE TABLE note_tag (id text PRIMARY KEY, note_id text REFERENCES note(id) ON DELETE CASCADE);
CREATE TABLE node (id integer PRIMARY KEY, parent_id integer REFERENCES node(id) ON DELETE CASCADE);`;
  const SEED = `INSERT INTO parent VALUES ('p1', 'a');
INSERT INTO child VALUES ('c1', 'p1');
INSERT INTO grandchild VALUES ('g1', 'c1');
INSERT INTO note VALUES ('n1', 'p1');
INSERT INTO note_tag VALUES ('t1', 'n1');
INSERT INTO node VALUES (1, NULL), (2, 1), (3, 2);`;
  const REBUILD_PARENT = `CREATE TABLE __new_parent (id text PRIMARY KEY, name text NOT NULL);
INSERT INTO __new_parent SELECT id, coalesce(name, '') FROM parent;
DROP TABLE parent;
ALTER TABLE __new_parent RENAME TO parent;`;
  const KEEP = `PRAGMA defer_foreign_keys = on;
CREATE TABLE __keep_child AS SELECT * FROM child;
CREATE TABLE __keep_grandchild AS SELECT * FROM grandchild;
CREATE TABLE __keep_note AS SELECT * FROM note;`;
  const PUT_BACK = `INSERT OR REPLACE INTO child SELECT * FROM __keep_child;
INSERT OR REPLACE INTO grandchild SELECT * FROM __keep_grandchild;
UPDATE note SET parent_id = (SELECT parent_id FROM __keep_note k WHERE k.id = note.id);`;
  const NEW_NODE = `CREATE TABLE __new_node (id integer PRIMARY KEY, parent_id integer, label text NOT NULL DEFAULT '', FOREIGN KEY (parent_id) REFERENCES node(id) ON DELETE CASCADE);
INSERT INTO __new_node (id, parent_id) SELECT id, parent_id FROM node;`;
  const SWAP_NODE = `DROP TABLE node;
ALTER TABLE __new_node RENAME TO node;`;

  const check = (sql: string) =>
    findCascadingDrops([
      { name: "0000.sql", sql: SCHEMA },
      // drizzle-kit's file layout: one statement per chunk.
      {
        name: "0001.sql",
        sql: sql.replaceAll(";\n", ";--> statement-breakpoint\n"),
      },
    ]).flatMap((drop) => drop.affected);

  it.each([
    {
      recipe: "plain rebuild",
      sql: REBUILD_PARENT,
      lost: ["child", "grandchild", "note"],
    },
    {
      recipe: "put back from copies made after the drop",
      sql:
        REBUILD_PARENT.replace(
          "DROP TABLE parent;",
          `DROP TABLE parent;\n${KEEP}`,
        ) + `\n${PUT_BACK}`,
      lost: ["child", "grandchild", "note"],
    },
    {
      recipe: "SET NULL child put back with INSERT OR REPLACE",
      sql: `${KEEP}\n${REBUILD_PARENT}\n${PUT_BACK.replace(/UPDATE.*/, "INSERT OR REPLACE INTO note SELECT * FROM __keep_note;")}`,
      lost: ["note"],
    },
    {
      recipe: "self-referencing table put back with INSERT OR REPLACE",
      sql: `${NEW_NODE}\nCREATE TABLE __keep_node AS SELECT * FROM __new_node;\n${SWAP_NODE}\nINSERT OR REPLACE INTO node SELECT * FROM __keep_node;`,
      lost: ["__new_node"],
    },
  ])("rejects a $recipe", ({ sql, lost }) => {
    expect(check(sql)).toEqual(lost);
  });

  it.each([
    {
      recipe: "children copied aside and put back",
      sql: `${KEEP}\n${REBUILD_PARENT}\n${PUT_BACK}`,
    },
    {
      recipe: "self-referencing table put back with INSERT OR IGNORE",
      sql: `PRAGMA defer_foreign_keys = on;\n${NEW_NODE}\nCREATE TABLE __keep_node AS SELECT * FROM __new_node;\n${SWAP_NODE}\nINSERT OR IGNORE INTO node SELECT * FROM __keep_node;`,
    },
  ])("accepts $recipe, which keeps every row on D1", ({ sql }) => {
    expect(check(sql)).toEqual([]);

    const d1 = new DatabaseSync(":memory:");
    d1.exec(SCHEMA);
    d1.exec(SEED);
    d1.exec("PRAGMA foreign_keys = on");
    const rows = () =>
      ["child", "grandchild", "note", "note_tag", "node"].map((table) =>
        d1
          .prepare(
            `SELECT id, ${table === "node" ? "parent_id" : "*"} FROM ${table} ORDER BY id`,
          )
          .all(),
      );
    const kept = rows();
    d1.exec(`BEGIN;\n${sql}\nCOMMIT;`);
    expect(rows()).toEqual(kept);
  });
});
