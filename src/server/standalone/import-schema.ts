import { z } from "zod";
export const identifier = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/);
const value = z.union([z.string(), z.number().finite(), z.null()]);
export const importRowsSchema = z.object({
  table: identifier,
  columns: z.array(identifier).min(1).max(100),
  rows: z.array(z.array(value)).max(100),
});
