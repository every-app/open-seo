import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Globe,
  XCircle,
} from "lucide-react";
import { cn } from "cn";
import { MarkdownAnswer } from "@/client/features/ai-search/components/MarkdownAnswer";
import { getModelAccent } from "@/client/features/ai-search/platformLabels";
import {
  formatModelLabel,
  formatCountryLabel,
} from "@/shared/prompt-explorer-labels";
import { formatUrlForDisplay } from "@/client/components/table/url";
import { ExpandableList } from "@/client/components/ExpandableList";
import { Badge } from "@/client/components/ui/badge";
import type {
  PromptExplorerCitation,
  PromptExplorerModelResult,
  PromptExplorerResult,
} from "@/types/schemas/ai-search";

type Props = {
  result: PromptExplorerResult;
};

const ARTICLE_CLASS =
  "overflow-hidden rounded-r-lg border border-l-4 border-border bg-card";

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
    const skipped = modelResult.errorCode === "UNSUPPORTED_COUNTRY";
    return (
      <article className={cn(ARTICLE_CLASS, accent.border)}>
        <ModelHeader
          model={modelResult.model}
          modelName={null}
          tokens={null}
          webSearch={null}
          brandMentioned={null}
          highlightBrand={null}
          status={skipped ? "skipped" : "error"}
        />
        <div
          className={cn(
            "flex items-start gap-2 px-5 py-4 text-sm",
            skipped ? "text-muted-foreground" : "text-destructive",
          )}
        >
          {!skipped ? <AlertCircle className="mt-0.5 size-4 shrink-0" /> : null}
          <span>{modelResult.message}</span>
        </div>
      </article>
    );
  }

  return (
    <article className={cn(ARTICLE_CLASS, accent.border)}>
      <ModelHeader
        model={modelResult.model}
        modelName={modelResult.modelName}
        tokens={modelResult.outputTokens}
        webSearch={modelResult.webSearch}
        brandMentioned={modelResult.brandMentioned}
        highlightBrand={highlightBrand}
        status="success"
      />

      <p className="px-5 pt-3 text-xs text-muted-foreground">
        {modelResult.webSearchCountryCode
          ? `Country hint sent: ${formatCountryLabel(modelResult.webSearchCountryCode)}. This is not a verified search location.`
          : "No country hint sent. Any search uses the provider’s default location."}
      </p>
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
          <p className="mb-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">
            Related queries the model considered
          </p>
          <div className="flex flex-wrap gap-1.5">
            {modelResult.fanOutQueries.map((query, index) => (
              <Badge
                key={`${query}-${index}`}
                variant="outline"
                className="font-normal text-muted-foreground"
              >
                {query}
              </Badge>
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
  return (
    <div className="border-t border-border bg-muted/30 px-5 py-3">
      <p className="mb-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">
        Cited sources ({citations.length})
      </p>
      <ExpandableList
        items={citations}
        className="space-y-1.5"
        renderItem={(citation, index) => (
          <li
            key={`${citation.url}-${index}`}
            className="flex items-start gap-2 text-sm"
          >
            <span className="mt-1 size-1 shrink-0 rounded-full bg-foreground/30" />
            <a
              href={citation.url}
              target="_blank"
              rel="noreferrer"
              className={`inline-flex items-start gap-1 underline underline-offset-2 ${
                citation.matchedBrand ? "font-medium text-primary" : ""
              }`}
            >
              <span className="break-all">
                {citation.title || formatUrlForDisplay(citation.url)}
              </span>
              <ExternalLink className="mt-1 size-3 shrink-0" />
            </a>
            {citation.matchedBrand && highlightBrand ? (
              <Badge size="sm">{highlightBrand}</Badge>
            ) : null}
          </li>
        )}
      />
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
  /** null = not applicable (error card): render neither web-search state. */
  webSearch: boolean | null;
  brandMentioned: boolean | null;
  highlightBrand: string | null;
  status: "success" | "error" | "skipped";
}) {
  const accent = getModelAccent(model);
  return (
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`size-2 rounded-full ${accent.dot}`} />
        <h3 className="text-sm font-semibold">{formatModelLabel(model)}</h3>
        {modelName ? (
          <code className="text-xs text-muted-foreground">{modelName}</code>
        ) : null}
        {status === "error" ? <Badge variant="destructive">Error</Badge> : null}
        {status === "skipped" ? (
          <Badge variant="secondary">Skipped</Badge>
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
        ) : webSearch === false ? (
          // The model chose not to browse for this answer — that's why there
          // are no cited sources on this card.
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Globe className="size-3" />
            no web search
          </span>
        ) : null}
      </div>
      {tokens != null ? (
        <span className="text-xs text-muted-foreground tabular-nums">
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
      <Badge variant="success">
        <CheckCircle2 data-icon="inline-start" />
        {highlightBrand}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="font-normal text-muted-foreground">
      <XCircle data-icon="inline-start" />
      no {highlightBrand}
    </Badge>
  );
}
