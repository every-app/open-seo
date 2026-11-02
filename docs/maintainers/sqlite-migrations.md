# SQLite migrations that rebuild a table

drizzle-kit changes a SQLite table it can't `ALTER` (a column's type, NOT NULL or default, a CHECK, a table constraint) by rebuilding it:

```sql
PRAGMA foreign_keys=OFF;
CREATE TABLE `__new_x` (...);
INSERT INTO `__new_x` (...) SELECT ... FROM `x`;
DROP TABLE `x`;
ALTER TABLE `__new_x` RENAME TO `x`;
PRAGMA foreign_keys=ON;
```

D1 keeps foreign keys on inside a migration and ignores that first pragma. `DROP TABLE x` then runs SQLite's implicit `DELETE FROM x` with foreign keys on, so every `ON DELETE CASCADE` child of `x` loses all its rows (and their own cascading children with them), and `ON DELETE SET NULL` children have their keys blanked. `PRAGMA defer_foreign_keys = on` doesn't help: it defers constraint checks, not delete actions. Nearly every product table cascades from `projects` or `organization`, so a rebuild of either would empty most of the database on the Cloudflare self-host and Every App installs.

`src/db/sqliteMigrations.test.ts` fails CI when a migration in `drizzle/sqlite/` drops a table that others reference with a cascading key. Before committing a generated migration, look for `__new_` and pick one of these:

1. **Hand-written `ALTER TABLE`.** Edit the generated file to change the table in place where SQLite allows it: `ADD COLUMN` (which takes a column-level `CHECK` and a constant default), `RENAME COLUMN`, `DROP COLUMN` of an unindexed, unreferenced column. Keep the Postgres migration and both schemas equivalent.
2. **Copy the children aside.** When a rebuild is unavoidable, start the migration with `PRAGMA defer_foreign_keys = on;`, copy each affected child table aside before the drop, and put its rows back after the rename. The check lists every affected table, including grandchildren.

   ```sql
   PRAGMA defer_foreign_keys = on;--> statement-breakpoint
   CREATE TABLE `__keep_child` AS SELECT * FROM `child`;--> statement-breakpoint
   -- drizzle-kit's CREATE __new_x / INSERT / DROP TABLE x / RENAME here
   INSERT OR REPLACE INTO `child` SELECT * FROM `__keep_child`;--> statement-breakpoint
   DROP TABLE `__keep_child`;
   ```

   Restore parents before their children. `OR REPLACE` lets the same migration run where the pragma did turn keys off and the rows were never deleted (plain SQLite in tests). `defer_foreign_keys` also keeps a `NO ACTION` child from failing the drop.

3. **Deleting the rows is the point.** Add the line `-- everyapp: allow-cascading-drop` to the migration, on its own. It is the same marker the Every App CLI accepts before deploying.

The drizzle-kit pragmas still matter for plain SQLite, so leave them in; they just aren't enough on D1.
