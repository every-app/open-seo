import { loader } from "fumadocs-core/source";
// Keep this deep import for now: the public "fumadocs-mdx/runtime/vite" entry
// resolves to the browser runtime in our SSR build, which breaks sourceAsync.
import { fromConfig } from "../../node_modules/fumadocs-mdx/dist/runtime/vite/server.js";
import { blog } from "../../source.generated";
import type * as Config from "../../source.config";

const serverCreate = fromConfig<typeof Config>();

export const blogSource = loader({
  source: await serverCreate.sourceAsync(blog, {} as Record<string, never>),
  baseUrl: "/blogs",
});

export { blog };
