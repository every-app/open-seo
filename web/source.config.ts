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
export default defineConfig({
  mdxOptions: {
    remarkImageOptions: {
      // Keep MDX images as public-directory URLs. The default converts them
      // into JS imports, which Vite rejects with "Assets in public directory
      // cannot be imported from JavaScript" — one warning per image, flooding
      // dev and browser-test output. Width/height are still probed from
      // web/public, so a missing image fails the build instead of 404ing.
      useImport: false,
    },
  },
});
