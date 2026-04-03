declare module "*.md" {
  import type { ComponentType } from "react";

  export const frontmatter: {
    title: string;
    description?: string;
    [key: string]: unknown;
  };

  const MDXContent: ComponentType<{
    components?: Record<string, unknown>;
  }>;

  export default MDXContent;
}

declare module "*.mdx" {
  import type { ComponentType } from "react";

  export const frontmatter: {
    title: string;
    description?: string;
    [key: string]: unknown;
  };

  const MDXContent: ComponentType<{
    components?: Record<string, unknown>;
  }>;

  export default MDXContent;
}
