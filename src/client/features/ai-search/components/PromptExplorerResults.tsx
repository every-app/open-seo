import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Globe,
  XCircle,
} from "lucide-react";
import { MarkdownAnswer } from "@/client/features/ai-search/components/MarkdownAnswer";
import {
  formatModelLabel,
  getModelAccent,
} from "@/client/features/ai-search/platformLabels";
import { formatUrlForDisplay } from "@/client/components/table/url";
import type {
  PromptExplorerCitation,
  PromptExplorerModelResult,
  PromptExplorerResult,
} from "@/types/schemas/ai-search";

import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
type Props = {
  result: PromptExplorerResult;
};

export function PromptExplorerResults({ result }: Props) {
  return (
    <div className="space-y-5">
      {result.results.map((modelResult) => (
        <ModelResultCard
          key={modelResult.model}
          modelResult={modelResult}
          highlightBrand={result.highlightBrand}
        />
      ))}
    </div>
  );
}

function ModelResultCard({
  modelResult,
  highlightBrand,
}: {
  modelResult: PromptExplorerModelResult;
  highlightBrand: string | null;
}) {
  const accent = getModelAccent(modelResult.model);

  if (modelResult.status === "error") {
    return (
      <article
        className={`overflow-hidden rounded-r-lg border border-border border-l-4 ${accent.border} bg-card`}
      >
        <ModelHeader
          model={modelResult.model}
          modelName={null}
          tokens={null}
          webSearch={false}
          brandMentioned={null}
          highlightBrand={null}
          status="error"
        />
        <div className="flex items-start gap-2 px-5 py-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{modelResult.message}</span>
        </div>
      </article>
    );
  }

  return (
    <article
      className={`overflow-hidden rounded-r-lg border border-border border-l-4 ${accent.border} bg-card`}
    >
      <ModelHeader
        model={modelResult.model}
        modelName={modelResult.modelName}
        tokens={modelResult.outputTokens}
        webSearch={modelResult.webSearch}
        brandMentioned={modelResult.brandMentioned}
        highlightBrand={highlightBrand}
        status="success"
      />

      <div className="px-5 py-5">
        <MarkdownAnswer text={modelResult.text} />
      </div>

      {modelResult.citations.length > 0 ? (
        <CitationsList
          citations={modelResult.citations}
          highlightBrand={highlightBrand}
        />
      ) : null}

      {modelResult.fanOutQueries.length > 0 ? (
        <div className="border-t border-border px-5 py-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
            Related queries the model considered
          </p>
          <div className="flex flex-wrap gap-1.5">
            {modelResult.fanOutQueries.map((query, index) => (
              <span
                key={`${query}-${index}`}
                className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground"
              >
                {query}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function CitationsList({
  citations,
  highlightBrand,
}: {
  citations: PromptExplorerCitation[];
  highlightBrand: string | null;
}) {
  const [expanded, setExpanded] = useState(false);

  const visible = expanded ? citations : citations.slice(0, 3);
  const remaining = citations.length - visible.length;

  return (
    <div className="border-t border-border bg-muted/30 px-5 py-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
        Cited sources ({citations.length})
      </p>
      <ul className="space-y-1.5">
        {visible.map((citation, index) => (
          <li
            key={`${citation.url}-${index}`}
            className="flex items-start gap-2 text-sm"
          >
            <span className="mt-1 size-1 shrink-0 rounded-full bg-foreground/30" />
            <a
              href={citation.url}
              target="_blank"
              rel="noreferrer"
              className={`underline underline-offset-4 inline-flex items-start gap-1 ${
                citation.matchedBrand ? "text-primary font-medium" : ""
              }`}
            >
              <span className="break-all">
                {citation.title || formatUrlForDisplay(citation.url)}
              </span>
              <ExternalLink className="mt-1 size-3 shrink-0" />
            </a>
            {citation.matchedBrand && highlightBrand ? (
              <Badge variant="primary" className="px-2 text-[11px]">
                {highlightBrand}
              </Badge>
            ) : null}
          </li>
        ))}
      </ul>
      {citations.length > 3 ? (
        <Button
          variant="ghost"
          onClick={() => setExpanded((current) => !current)}
          className="h-auto rounded-md px-0 hover:bg-transparent mt-1.5 text-xs text-muted-foreground/70 hover:text-foreground"
        >
          {expanded ? "Show less" : `+${remaining} more`}
        </Button>
      ) : null}
    </div>
  );
}

function ModelHeader({
  model,
  modelName,
  tokens,
  webSearch,
  brandMentioned,
  highlightBrand,
  status,
}: {
  model: PromptExplorerModelResult["model"];
  modelName: string | null;
  tokens: number | null;
  webSearch: boolean;
  brandMentioned: boolean | null;
  highlightBrand: string | null;
  status: "success" | "error";
}) {
  const accent = getModelAccent(model);
  return (
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`size-2 rounded-full ${accent.dot}`} />
        <h3 className="text-sm font-semibold">{formatModelLabel(model)}</h3>
        {modelName ? (
          <code className="text-xs text-muted-foreground/70">{modelName}</code>
        ) : null}
        {status === "error" ? (
          <Badge variant="destructive" className="px-2 text-[11px]">
            Error
          </Badge>
        ) : null}
        <BrandMentionBadge
          mentioned={brandMentioned}
          highlightBrand={highlightBrand}
        />
        {webSearch ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Globe className="size-3" />
            web search
          </span>
        ) : null}
      </div>
      {tokens != null ? (
        <span className="text-xs tabular-nums text-muted-foreground/70">
          {tokens.toLocaleString()} tokens
        </span>
      ) : null}
    </header>
  );
}

function BrandMentionBadge({
  mentioned,
  highlightBrand,
}: {
  mentioned: boolean | null;
  highlightBrand: string | null;
}) {
  if (mentioned == null || !highlightBrand) return null;
  if (mentioned) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
        <CheckCircle2 className="size-3" />
        {highlightBrand}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      <XCircle className="size-3" />
      no {highlightBrand}
    </span>
  );
}
