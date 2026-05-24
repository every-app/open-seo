import { loader } from "fumadocs-core/source";
// Keep this server runtime import explicit. In this app's SSR build, the
// public Vite runtime entry resolves to the browser variant for sourceAsync.
import { fromConfig } from "../../node_modules/fumadocs-mdx/dist/runtime/vite/server.js";
import { docs, docsMeta, guide } from "../../source.generated";
import type * as Config from "../../source.config";

const serverCreate = fromConfig<typeof Config>();

export const guideSource = loader({
  source: await serverCreate.sourceAsync(guide, {} as Record<string, never>),
  baseUrl: "/guides",
});

export const docsSource = loader({
  source: await serverCreate.sourceAsync(docs, docsMeta),
  baseUrl: "/docs",
  plugins: [
    {
      transformPageTree: {
        folder(node, folderPath) {
          if (folderPath !== "skills") return node;

          return {
            ...node,
            index: undefined,
          };
        },
      },
    },
  ],
});
