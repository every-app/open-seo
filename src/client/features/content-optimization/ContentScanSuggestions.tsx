import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import type { OnPageReport } from "@/serverFunctions/contentOptimization";
import {
  buildInternalLinksSectionText,
  buildSuggestionsSectionText,
} from "./agentBrief";
import { SectionCopyButton } from "./SectionCopyButton";

export function SuggestionsCard({ report }: { report: OnPageReport }) {
  const swipe = report.topic_and_classification.swipe_content;
  const questions = report.topic_and_classification.topical_authority_questions;
  const questionGroups = Object.entries(questions).filter(
    ([, items]) => items.length > 0,
  );
  const hasContent =
    swipe.suggested_title !== null || questionGroups.length > 0;
  if (!hasContent) return null;

  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-4 p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Suggestions</h2>
          <SectionCopyButton
            getText={() => buildSuggestionsSectionText(report)}
          />
        </div>
        {swipe.suggested_title && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-base-content/50">
              Suggested title
            </h3>
            <div className="pt-1.5">
              <CopyRow text={swipe.suggested_title}>
                <span className="text-[15px] font-medium leading-relaxed">
                  {swipe.suggested_title}
                </span>
              </CopyRow>
            </div>
          </div>
        )}
        {questionGroups.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-base-content/50">
              Topical Authority Questions
            </h3>
            <div className="space-y-3 pt-2">
              {questionGroups.map(([group, items]) => (
                <div key={group}>
                  <p className="pb-0.5 text-base font-semibold capitalize">
                    {group}
                  </p>
                  {items.map((question) => (
                    <CopyRow key={question} text={question}>
                      <span className="text-[15px] leading-relaxed text-base-content/80">
                        {question}
                      </span>
                    </CopyRow>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function InternalLinksCard({ report }: { report: OnPageReport }) {
  const links = report.internal_linking.add_internal_links_from;
  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-3 p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Internal Links</h2>
          <SectionCopyButton
            getText={() => buildInternalLinksSectionText(report)}
          />
        </div>
        <p className="text-sm text-base-content/60">
          Pages on this site that should link to the scanned page.
        </p>
        {links.length > 0 ? (
          <div>
            {links.map((link) => (
              <CopyRow key={link} text={link}>
                <a
                  className="link truncate text-[15px]"
                  href={link}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {link}
                </a>
              </CopyRow>
            ))}
          </div>
        ) : (
          <p className="text-[15px] text-base-content/50">
            No internal link opportunities detected on this site for this page.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * A line with a hover-revealed copy control: invisible until the row is
 * hovered (or focused), then one click copies exactly that line.
 */
function CopyRow({
  text,
  children,
}: {
  text: string;
  children: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <div className="group flex items-start justify-between gap-2 rounded-[3px] px-2 py-1 transition-colors hover:bg-base-200/60">
      <span className="min-w-0 flex-1 before:pr-2 before:text-base-content/30 before:content-['·']">
        {children}
      </span>
      <button
        type="button"
        aria-label={`Copy: ${text}`}
        title="Copy"
        onClick={() => {
          void navigator.clipboard.writeText(text);
          setCopied(true);
          if (timer.current !== null) clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(false), 1200);
        }}
        className={`btn btn-ghost btn-xs shrink-0 px-1.5 transition-opacity focus:opacity-100 ${
          copied ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        {copied ? (
          <Check className="size-3.5" style={{ color: "#3fb950" }} />
        ) : (
          <Copy className="size-3.5 text-base-content/50" />
        )}
      </button>
    </div>
  );
}
