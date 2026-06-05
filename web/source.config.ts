import {
  defineConfig,
  defineCollections,
  frontmatterSchema,
  metaSchema,
} from "fumadocs-mdx/config/zod-3";
import { z } from "zod";

const pageSchema = frontmatterSchema as any;

export const blog = defineCollections({
  type: "doc",
  dir: "content/blogs",
  schema: pageSchema.extend({
    author: z.string(),
    date: z.string(),
  }),
});

export const docs = defineCollections({
  type: "doc",
  dir: "content/docs",
  schema: pageSchema,
});

export const docsMeta = defineCollections({
  type: "meta",
  dir: "content/docs",
  schema: metaSchema,
});

export const legal = defineCollections({
  type: "doc",
  dir: "content/legal",
  schema: pageSchema,
});

export default defineConfig();
