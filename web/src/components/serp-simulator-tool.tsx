import { useEffect, useRef, useState } from "react";
import { trackTool } from "@/lib/free-tools/analytics";
import { FIELD_CLASS, FieldLabel } from "@/lib/free-tools/form";
import { brand } from "@/lib/brand";

const TOOL = "serp-simulator";
const DESKTOP_TITLE_WIDTH = 600;
const TITLE_FONT = "20px Arial, sans-serif";

const EXAMPLE = {
  title: `Free SERP Simulator: Preview Your Google Snippet | ${brand.name}`,
  description:
    "Preview your title and meta description on desktop and mobile. Check how your text fits before publishing. Free, no signup.",
  url: `${brand.marketingUrl}/serp-simulator`,
};

export function SerpSimulatorTool() {
  const [title, setTitle] = useState(EXAMPLE.title);
  const [description, setDescription] = useState(EXAMPLE.description);
  const [url, setUrl] = useState(EXAMPLE.url);
  const [showDate, setShowDate] = useState(false);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [titleWidth, setTitleWidth] = useState<number | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const editTracked = useRef(false);

  useEffect(() => {
    canvas.current ??= document.createElement("canvas");
    const context = canvas.current.getContext("2d");
    if (!context) return;
    context.font = TITLE_FONT;
    setTitleWidth(Math.round(context.measureText(title).width));
  }, [title]);

  const trackFirstEdit = () => {
    if (editTracked.current) return;
    editTracked.current = true;
    trackTool("tool_run", TOOL);
    trackTool("tool_result", TOOL);
  };

  const displayUrl = url.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const [host, ...segments] = displayUrl.split("/");
  const today = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const desktop = device === "desktop";
  const overDesktop = titleWidth !== null && titleWidth > DESKTOP_TITLE_WIDTH;

  return (
    <div>
      <div className="rounded-xl border border-[var(--color-border-subtle)] bg-white p-4 md:p-5">
        <div className="grid gap-3">
          <div>
            <FieldLabel htmlFor="serp-title">Page title</FieldLabel>
            <input
              id="serp-title"
              type="text"
              maxLength={300}
              value={title}
              onChange={(e) => {
                trackFirstEdit();
                setTitle(e.target.value);
              }}
              className={`mt-1 ${FIELD_CLASS}`}
            />
            <p
              className={`mt-1.5 text-xs ${overDesktop ? "text-amber-800" : "text-[var(--color-brand-muted)]"}`}
            >
              {title.length} characters &middot;{" "}
              {titleWidth === null ? "Measuring width…" : `${titleWidth}px`}
              {overDesktop
                ? " · Exceeds the 600px desktop preview"
                : " · Desktop guide: 600px"}
            </p>
          </div>

          <div>
            <FieldLabel htmlFor="serp-description">Meta description</FieldLabel>
            <textarea
              id="serp-description"
              rows={3}
              maxLength={1000}
              value={description}
              onChange={(e) => {
                trackFirstEdit();
                setDescription(e.target.value);
              }}
              className={`mt-1 ${FIELD_CLASS} h-auto py-2.5`}
            />
            <p className="mt-1.5 text-xs text-[var(--color-brand-muted)]">
              {description.length} characters &middot; Check how the text wraps
              in each preview.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <FieldLabel htmlFor="serp-url">URL</FieldLabel>
              <input
                id="serp-url"
                type="text"
                inputMode="url"
                spellCheck={false}
                value={url}
                onChange={(e) => {
                  trackFirstEdit();
                  setUrl(e.target.value);
                }}
                className={`mt-1 ${FIELD_CLASS}`}
              />
            </div>
            <label className="flex h-11 items-center gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                checked={showDate}
                onChange={(e) => setShowDate(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--color-border-subtle)]"
              />
              Show date
            </label>
          </div>
        </div>
        <p className="mt-2.5 text-xs text-[var(--color-brand-muted)]">
          Free &middot; No signup &middot; Your text stays in your browser
        </p>
      </div>

      <section className="mt-6" aria-label="Search result preview">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-neutral-950">
            Search preview
          </h2>
          <div
            role="group"
            aria-label="Preview device"
            className="inline-flex rounded-lg border border-[var(--color-border-subtle)] bg-white p-1"
          >
            {(["desktop", "mobile"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={device === option}
                onClick={() => setDevice(option)}
                className={`min-h-11 rounded-md px-4 text-sm font-medium capitalize focus-visible:outline-2 focus-visible:outline-offset-2 ${device === option ? "bg-neutral-950 text-white" : "text-neutral-700 hover:bg-neutral-100"}`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-2 text-xs text-[var(--color-brand-muted)]">
          {desktop
            ? "Desktop preview at 600px text width."
            : "Mobile preview at 328px text width."}{" "}
          Layout and truncation are approximate.
        </p>
        <p
          className={`mt-2 text-xs text-[var(--color-brand-muted)] ${desktop ? "min-[700px]:hidden" : "min-[420px]:hidden"}`}
        >
          Scroll sideways to see the full preview.
        </p>
        <div
          role="region"
          aria-label={`${device} search preview`}
          tabIndex={0}
          className="mt-3 overflow-x-auto rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
        >
          <div
            className={`w-max rounded-xl border border-[var(--color-border-subtle)] bg-white ${desktop ? "p-5" : "p-4"}`}
          >
            <div
              className={desktop ? "w-[600px]" : "w-[328px]"}
              style={{ fontFamily: "Arial, sans-serif" }}
            >
              <p className="truncate text-xs text-neutral-700">
                {host}
                {desktop && segments.length > 0
                  ? ` › ${segments.join(" › ")}`
                  : ""}
              </p>
              <p
                className={`mt-1 text-[20px] leading-7 text-[#1a0dab] ${desktop ? "truncate" : "line-clamp-2 [overflow-wrap:anywhere]"}`}
              >
                {title}
              </p>
              <p
                className={`mt-1 text-[14px] leading-[22px] text-neutral-600 [overflow-wrap:anywhere] ${desktop ? "line-clamp-2" : "line-clamp-3"}`}
              >
                {showDate ? (
                  <span className="text-neutral-500">{today} — </span>
                ) : null}
                {description}
              </p>
            </div>
          </div>
        </div>
      </section>

      <p className="mt-3 text-xs text-[var(--color-brand-muted)]">
        Google may rewrite your title or description for a search query. Actual
        results also vary by screen size and layout.
      </p>
    </div>
  );
}
