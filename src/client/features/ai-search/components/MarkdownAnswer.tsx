import {
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Props = {
  text: string;
};

/**
 * Collapsed-state max height in px. Roughly 9 lines of body text — enough
 * to convey the shape of an answer without dominating the page when four
 * models are stacked.
 */
const COLLAPSED_MAX_PX = 240;

/**
 * Render an LLM's markdown answer with explicit per-element Tailwind classes.
 *
 * Long answers collapse to ~12 lines with a fade-out gradient and a
 * "Read more" toggle so a side-by-side comparison of four models stays
 * scannable. We measure the rendered scroll height to decide whether the
 * toggle is needed.
 *
 * Anchor URLs are sanitized to http(s) only — LLMs can be coaxed into
 * emitting `javascript:` payloads.
 */
export function MarkdownAnswer({ text }: Props) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [needsCollapse, setNeedsCollapse] = useState(false);
  const { thinking, body } = extractThinkingBlocks(text);
  const normalized = normalizeLlmMarkdown(body);

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    // scrollHeight reflects natural content height even when overflow is
    // clipped by max-h, so we can detect overflow without toggling state.
    setNeedsCollapse(el.scrollHeight > COLLAPSED_MAX_PX + 8);
  }, [normalized]);

  if (normalized.trim().length === 0 && thinking.length === 0) {
    return (
      <p className="text-sm text-base-content/60 italic">
        Model returned an empty response.
      </p>
    );
  }

  const isCollapsed = needsCollapse && !expanded;

  return (
    <div className="text-sm leading-relaxed">
      {thinking.map((block, index) => (
        <ThinkingBlock key={index} text={block} />
      ))}

      {normalized.trim().length > 0 ? (
        <div className="relative">
          <div
            ref={contentRef}
            style={
              isCollapsed ? { maxHeight: `${COLLAPSED_MAX_PX}px` } : undefined
            }
            className={isCollapsed ? "overflow-hidden" : undefined}
          >
            <Markdown
              remarkPlugins={[remarkGfm]}
              components={MARKDOWN_COMPONENTS}
            >
              {normalized}
            </Markdown>
          </div>

          {isCollapsed ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-base-100 to-transparent"
            />
          ) : null}
        </div>
      ) : null}

      {needsCollapse ? (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          aria-expanded={expanded}
        >
          {expanded ? (
            <>
              <ChevronUp className="size-3.5" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="size-3.5" />
              Read more
            </>
          )}
        </button>
      ) : null}
    </div>
  );
}

function ThinkingBlock({ text }: { text: string }) {
  return (
    <details
      open
      className="group mb-3 rounded-lg border border-base-300 bg-base-200/40"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-medium text-base-content/70 hover:text-base-content">
        <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
        Model Thinking
      </summary>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-b-lg border-t border-base-300 bg-base-200/60 px-3 py-2.5 text-xs font-mono text-base-content/80">
        {text}
      </pre>
    </details>
  );
}

/**
 * Reasoning models (e.g. Perplexity sonar-reasoning-pro) wrap their chain of
 * thought in `<think>...</think>` tags inline with the answer. Pull those out
 * so we can render them in a separate, collapsible block.
 *
 * Tolerates an unclosed final `<think>` (e.g. from a truncated stream) by
 * treating everything after it as a thinking block.
 */
function extractThinkingBlocks(text: string): {
  thinking: string[];
  body: string;
} {
  const thinking: string[] = [];
  let body = text;

  body = body.replace(/<think>([\s\S]*?)<\/think>/gi, (_, inner: string) => {
    thinking.push(inner.trim());
    return "";
  });

  body = body.replace(/<think>([\s\S]*)$/i, (_, inner: string) => {
    thinking.push(inner.trim());
    return "";
  });

  return { thinking, body };
}

/**
 * Fix a class of malformed markdown we see from LLM responses: a list marker
 * (`-`, `*`, `+`, or `1.`) on a line by itself, followed by a blank line,
 * followed by the actual item content as a separate paragraph. Default
 * markdown correctly renders that as an empty bullet + detached paragraph,
 * which looks broken. Collapse the blank line so the marker and content
 * form a proper list item.
 */
function normalizeLlmMarkdown(text: string): string {
  return text.replace(
    /^([ \t]*)([-*+]|\d+\.)[ \t]*\r?\n[ \t]*\r?\n(?=\S)(?![ \t]*(?:[-*+]|\d+\.)[ \t])/gm,
    "$1$2 ",
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

const MARKDOWN_COMPONENTS = {
  h1: ({ children }: { children?: ReactNode }) => (
    <h1 className="mt-4 mb-2 text-base font-semibold first:mt-0">{children}</h1>
  ),
  h2: ({ children }: { children?: ReactNode }) => (
    <h2 className="mt-4 mb-2 text-sm font-semibold first:mt-0">{children}</h2>
  ),
  h3: ({ children }: { children?: ReactNode }) => (
    <h3 className="mt-3 mb-1.5 text-sm font-semibold first:mt-0">{children}</h3>
  ),
  h4: ({ children }: { children?: ReactNode }) => (
    <h4 className="mt-3 mb-1 text-sm font-semibold first:mt-0">{children}</h4>
  ),
  p: ({ children }: { children?: ReactNode }) => (
    <p className="my-2 first:mt-0 last:mb-0">{children}</p>
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
      <table className="table table-xs border border-base-300">
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
