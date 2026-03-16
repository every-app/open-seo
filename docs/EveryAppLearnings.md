# EveryApp Learnings

Things to add to EveryApp skill files later.

## D1

- `db.batch()` is required for multi-row inserts — D1 has a 100 bind param limit per statement, so multi-row `INSERT VALUES (...), (...)` breaks. Use individual INSERT statements batched via `db.batch()` (up to 100 statements per call).
