import type { ComponentPropsWithoutRef, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";

type Props = {
  /** Raw Markdown source to render. */
  children: string;
  className?: string;
};

/**
 * Shared Markdown renderer with explicit per-element Tailwind classes.
 *
 * OpenSEO doesn't ship `@tailwindcss/typography`, so `prose` classes are
 * no-ops — every block element is styled here instead. Tables use the Halo
 * Table at a compact density so model- and strategy-generated tables stay
 * readable.
 *
 * Anchor URLs are sanitized to http(s) only — LLMs can be coaxed into
 * emitting `javascript:` payloads.
 */
export function Markdown({ children, className }: Props) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={MARKDOWN_COMPONENTS}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

type AnchorProps = ComponentPropsWithoutRef<"a">;

function SafeAnchor({ href, children, ...rest }: AnchorProps) {
  const safeHref = isHttpUrl(href) ? href : undefined;
  if (!safeHref) {
    return <span className="underline decoration-dotted">{children}</span>;
  }
  return (
    <a
      {...rest}
      href={safeHref}
      target="_blank"
      rel="noreferrer"
      className="underline underline-offset-4 text-link"
    >
      {children}
    </a>
  );
}

function isHttpUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    // Mirror server-side `safeHttpUrl` — a `user:pass@host` URL shows one
    // hostname in link text while auth hits another.
    if (url.username || url.password) return false;
    return true;
  } catch {
    return false;
  }
}

export const MARKDOWN_COMPONENTS = {
  h1: ({ children }: { children?: ReactNode }) => (
    <h1 className="mt-5 mb-2 text-base font-semibold first:mt-0">{children}</h1>
  ),
  h2: ({ children }: { children?: ReactNode }) => (
    <h2 className="mt-5 mb-2 text-sm font-semibold first:mt-0">{children}</h2>
  ),
  h3: ({ children }: { children?: ReactNode }) => (
    <h3 className="mt-4 mb-1.5 text-sm font-semibold first:mt-0">{children}</h3>
  ),
  h4: ({ children }: { children?: ReactNode }) => (
    <h4 className="mt-3 mb-1 text-sm font-semibold first:mt-0">{children}</h4>
  ),
  p: ({ children }: { children?: ReactNode }) => (
    <p className="my-2 leading-relaxed first:mt-0 last:mb-0">{children}</p>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="my-2 ml-5 list-disc space-y-1">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="my-2 ml-5 list-decimal space-y-1">{children}</ol>
  ),
  li: ({ children }: { children?: ReactNode }) => (
    <li className="leading-relaxed">{children}</li>
  ),
  a: SafeAnchor,
  strong: ({ children }: { children?: ReactNode }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  em: ({ children }: { children?: ReactNode }) => (
    <em className="italic">{children}</em>
  ),
  blockquote: ({ children }: { children?: ReactNode }) => (
    <blockquote className="my-2 border-l-2 border-border pl-3 text-foreground italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-border" />,
  code: ({ children, className }: ComponentPropsWithoutRef<"code">) => {
    // Inline code (no `language-*` className from remark) gets the badge style;
    // block code is rendered by `pre` with a different shell.
    if (typeof className === "string" && className.startsWith("language-")) {
      return <code className={className}>{children}</code>;
    }
    return (
      <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">
        {children}
      </code>
    );
  },
  pre: ({ children }: { children?: ReactNode }) => (
    <pre className="my-2 overflow-x-auto rounded-lg bg-muted p-3 text-xs font-mono">
      {children}
    </pre>
  ),
  table: ({ children }: { children?: ReactNode }) => (
    <Table containerClassName="my-3">{children}</Table>
  ),
  thead: ({ children }: { children?: ReactNode }) => (
    <TableHeader>{children}</TableHeader>
  ),
  tbody: ({ children }: { children?: ReactNode }) => (
    <TableBody>{children}</TableBody>
  ),
  tr: ({ children }: { children?: ReactNode }) => (
    <TableRow>{children}</TableRow>
  ),
  th: ({ children }: { children?: ReactNode }) => (
    <TableHead className="h-auto px-2 py-1.5 font-semibold text-foreground">
      {children}
    </TableHead>
  ),
  td: ({ children }: { children?: ReactNode }) => (
    <TableCell className="px-2 py-1.5 align-top">{children}</TableCell>
  ),
};
