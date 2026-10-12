import {
  defineConfig,
  defineCollections,
  frontmatterSchema,
  metaSchema,
} from "fumadocs-mdx/config";
import { z } from "zod";

const pageSchema = frontmatterSchema;

export const blog = defineCollections({
  type: "doc",
  dir: "content/blogs",
  schema: pageSchema.extend({
    author: z.string(),
    // YYYY-MM-DD: the blog index sorts on this string.
    date: z.iso.date(),
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
