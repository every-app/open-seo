import { defineConfig, defineCollections } from "fumadocs-mdx/config";
import { metaSchema, pageSchema } from "fumadocs-core/source/schema";
import { z } from "zod";

export const blog = defineCollections({
  type: "doc",
  dir: "content/blogs",
  // Server code reads frontmatter only; pages render through the browser loader.
  async: true,
  schema: pageSchema.extend({
    author: z.string(),
    // YYYY-MM-DD: the blog index sorts on this string.
    date: z.iso.date(),
  }),
});

export const docs = defineCollections({
  type: "doc",
  dir: "content/docs",
  async: true,
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
