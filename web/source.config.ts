import {
  defineConfig,
  defineCollections,
  frontmatterSchema,
} from "fumadocs-mdx/config/zod-3";
import { z } from "zod";

export const blog = defineCollections({
  type: "doc",
  dir: "content/blog",
  schema: (frontmatterSchema as any).extend({
    author: z.string(),
    date: z.string(),
  }),
});

export default defineConfig();
