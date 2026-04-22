import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { guideSource } from "@/lib/source";

export const getGuidePost = createServerFn({ method: "GET" })
  .inputValidator((slugs: string[]) => slugs)
  .handler(async ({ data: slugs }) => {
    const page = guideSource.getPage(slugs);
    if (!page) throw notFound();

    return {
      path: page.path,
      title: page.data.title,
      description: page.data.description,
      url: page.url,
    };
  });

export const getGuidePosts = createServerFn({ method: "GET" }).handler(
  async () => {
    const pages = guideSource.getPages();
    return pages.map((page: (typeof pages)[number]) => ({
      title: page.data.title,
      description: page.data.description,
      url: page.url,
      slugs: page.slugs,
    }));
  },
);
