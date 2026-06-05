import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { blogSource, docsSource } from "@/lib/source";

export const getBlogPost = createServerFn({ method: "GET" })
  .inputValidator((slugs: string[]) => slugs)
  .handler(async ({ data: slugs }) => {
    const page = blogSource.getPage(slugs);
    if (!page) throw notFound();

    return {
      path: page.path,
      title: page.data.title,
      description: page.data.description,
      url: page.url,
    };
  });

export const getBlogPosts = createServerFn({ method: "GET" }).handler(
  async () => {
    const pages = blogSource.getPages();
    return pages.map((page: (typeof pages)[number]) => ({
      title: page.data.title,
      description: page.data.description,
      url: page.url,
      slugs: page.slugs,
    }));
  },
);

function getContentPost(slugs: string[]) {
  const page = docsSource.getPage(slugs);
  if (!page) throw notFound();

  return {
    path: page.path,
    title: page.data.title,
    description: page.data.description,
    url: page.url,
  };
}

function getContentPosts() {
  const topLevelOrder = new Map([
    ["mcp", 0],
    ["skills", 1],
  ]);
  const pages = docsSource.getPages();

  return pages
    .map((page: (typeof pages)[number]) => ({
      title: page.data.title,
      description: page.data.description,
      url: page.url,
      slugs: page.slugs,
    }))
    .sort((a, b) => {
      const depth = a.slugs.length - b.slugs.length;
      if (depth !== 0) return depth;

      const order =
        (topLevelOrder.get(a.slugs[0] ?? "") ?? Number.MAX_SAFE_INTEGER) -
        (topLevelOrder.get(b.slugs[0] ?? "") ?? Number.MAX_SAFE_INTEGER);
      if (order !== 0) return order;

      return a.title.localeCompare(b.title);
    });
}

export const getDocsPost = createServerFn({ method: "GET" })
  .inputValidator((slugs: string[]) => slugs)
  .handler(async ({ data: slugs }) => getContentPost(slugs));

export const getDocsPosts = createServerFn({ method: "GET" }).handler(
  async () => getContentPosts(),
);

export const getDocsPageTree = createServerFn({ method: "GET" }).handler(
  async () => docsSource.getPageTree() as any,
);
