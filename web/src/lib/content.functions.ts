import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { blogSource } from "@/lib/source";

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
    return pages.map((page) => ({
      title: page.data.title,
      description: page.data.description,
      url: page.url,
      slugs: page.slugs,
    }));
  },
);
