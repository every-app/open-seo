import { loader } from "fumadocs-core/source";
import { toFumadocsSource } from "fumadocs-mdx/runtime/server";
import { blog, docs, docsMeta } from "fumadocs-mdx:collections/server";

export const blogSource = loader({
  source: toFumadocsSource(blog, []),
  baseUrl: "/blogs",
});

export const docsSource = loader({
  source: toFumadocsSource(docs, docsMeta),
  baseUrl: "/docs",
  plugins: [
    {
      transformPageTree: {
        folder(node, folderPath) {
          // skills/meta.json lists an explicit "[Overview](...)" link; drop the
          // index node so the folder title doesn't duplicate it.
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
