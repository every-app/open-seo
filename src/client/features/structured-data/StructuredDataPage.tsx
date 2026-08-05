import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { StructuredDataResults } from "@/client/features/structured-data/StructuredDataResults";
import {
  FAILURE_MESSAGE,
  type StructuredDataValidation,
} from "@/client/features/structured-data/structuredDataView";
import { validateStructuredData } from "@/serverFunctions/structuredData";

type Mode = "markup" | "url";

const PLACEHOLDER_MARKUP = `{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "…",
  "author": { "@type": "Person", "name": "…" }
}`;

/**
 * Validate JSON-LD before publishing it, or a live page as served.
 *
 * A spot check by design — no history, no stored runs (spec 0012). The
 * site-wide view is the site audit, which raises invalid-structured-data and
 * incomplete-rich-result per page; Search Console's URL Inspection is the
 * authoritative verdict for anything Google has already crawled.
 */
export function StructuredDataPage({ projectId }: { projectId: string }) {
  const [mode, setMode] = React.useState<Mode>("markup");
  const [markup, setMarkup] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [validation, setValidation] =
    React.useState<StructuredDataValidation | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      validateStructuredData({
        data: {
          projectId,
          ...(mode === "markup"
            ? { markup: markup.trim() }
            : { url: url.trim() }),
        },
      }),
    onSuccess: (result) => setValidation(result),
  });

  const input = mode === "markup" ? markup : url;
  const canSubmit = input.trim().length > 0 && !mutation.isPending;

  const switchMode = (next: Mode) => {
    setMode(next);
    // The previous result described the other input; keeping it on screen would
    // attach a verdict to something the user is no longer looking at.
    setValidation(null);
    mutation.reset();
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Structured Data</h1>
        <p className="text-sm text-base-content/60 mt-1 max-w-prose">
          Check JSON-LD against the Schema.org vocabulary and Google's
          documented rich-result requirements — before you publish it, or on a
          live page as served. Advisory: for a page Google has already crawled,
          Search Console's own verdict is the authoritative one.
        </p>
      </div>

      <div className="flex flex-col gap-3 max-w-3xl">
        <div role="tablist" className="tabs tabs-border w-fit">
          <button
            type="button"
            role="tab"
            className={`tab ${mode === "markup" ? "tab-active" : ""}`}
            onClick={() => switchMode("markup")}
          >
            Paste markup
          </button>
          <button
            type="button"
            role="tab"
            className={`tab ${mode === "url" ? "tab-active" : ""}`}
            onClick={() => switchMode("url")}
          >
            Fetch a URL
          </button>
        </div>

        {mode === "markup" ? (
          <textarea
            className="textarea textarea-bordered font-mono text-xs h-56 w-full"
            placeholder={PLACEHOLDER_MARKUP}
            value={markup}
            onChange={(event) => setMarkup(event.target.value)}
            aria-label="JSON-LD or HTML to validate"
            spellCheck={false}
          />
        ) : (
          <input
            type="url"
            className="input input-bordered w-full max-w-xl"
            placeholder="https://example.com/page"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            aria-label="URL to fetch and validate"
          />
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="btn btn-primary btn-sm w-fit"
            disabled={!canSubmit}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Validating…" : "Validate"}
          </button>
          <p className="text-xs text-base-content/50">
            {mode === "markup"
              ? "A bare JSON-LD snippet or a whole HTML document. Nothing is stored."
              : "Reads the HTML as served, so JSON-LD injected by client-side JavaScript will not be seen."}
          </p>
        </div>
      </div>

      {mutation.isError && (
        <div className="alert alert-error">
          <span>{getStandardErrorMessage(mutation.error)}</span>
        </div>
      )}

      {validation && !validation.ok && (
        <div className="alert alert-warning">
          <span>{FAILURE_MESSAGE[validation.reason]}</span>
        </div>
      )}

      {validation?.ok && (
        <StructuredDataResults
          result={validation.result}
          source={validation.source}
        />
      )}
    </div>
  );
}
