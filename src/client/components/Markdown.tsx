import type { ComponentPropsWithoutRef, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Props = {
  /** Raw Markdown source to render. */
  children: string;
  className?: string;
};

/**
 * Shared Markdown renderer with explicit per-element Tailwind classes.
 *
 * OpenSEO doesn't ship `@tailwindcss/typography`, so `prose` classes are
 * no-ops — every block element is styled here instead. Tables use daisyUI's
 * `table table-sm` so model- and strategy-generated tables stay readable.
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
      className="link link-primary"
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
    <blockquote className="my-2 border-l-2 border-base-300 pl-3 text-base-content/80 italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-base-300" />,
  code: ({ children, className }: ComponentPropsWithoutRef<"code">) => {
    // Inline code (no `language-*` className from remark) gets the badge style;
    // block code is rendered by `pre` with a different shell.
    if (typeof className === "string" && className.startsWith("language-")) {
      return <code className={className}>{children}</code>;
    }
    return (
      <code className="rounded bg-base-200 px-1 py-0.5 text-xs font-mono">
        {children}
      </code>
    );
  },
  pre: ({ children }: { children?: ReactNode }) => (
    <pre className="my-2 overflow-x-auto rounded-lg bg-base-200 p-3 text-xs font-mono">
      {children}
    </pre>
  ),
  table: ({ children }: { children?: ReactNode }) => (
    <div className="my-3 overflow-x-auto">
      <table className="table table-sm border border-base-300">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }: { children?: ReactNode }) => <thead>{children}</thead>,
  tbody: ({ children }: { children?: ReactNode }) => <tbody>{children}</tbody>,
  tr: ({ children }: { children?: ReactNode }) => (
    <tr className="border-b border-base-300 last:border-0">{children}</tr>
  ),
  th: ({ children }: { children?: ReactNode }) => (
    <th className="px-2 py-1.5 text-left font-semibold">{children}</th>
  ),
  td: ({ children }: { children?: ReactNode }) => (
    <td className="px-2 py-1.5 align-top">{children}</td>
  ),
};
