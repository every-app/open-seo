import { cn } from "cn";
import { SCORE_TEXT_CLASS, scoreTone } from "@/client/features/audit/shared";
import type { LighthouseMetrics, LighthouseScores } from "./types";

export function LighthouseIssuesSummary({
  scores,
  metrics,
}: {
  scores?: LighthouseScores | null;
  metrics?: LighthouseMetrics | null;
}) {
  const metricItems = getMetricItems(metrics);

  if (!scores && metricItems.length === 0) {
    return null;
  }

  return (
    <>
      {scores ? (
        <div className="grid grid-cols-4 gap-3">
          <ScoreGauge label="Performance" score={scores.performance} />
          <ScoreGauge label="Accessibility" score={scores.accessibility} />
          <ScoreGauge label="Best Practices" score={scores["best-practices"]} />
          <ScoreGauge label="SEO" score={scores.seo} />
        </div>
      ) : null}
      {metricItems.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 rounded-lg border border-border bg-muted/30 px-4 py-3">
          {metricItems.map((metric) => (
            <div
              key={metric.label}
              className="flex items-baseline justify-between gap-2 py-1"
            >
              <span className="text-xs text-muted-foreground uppercase tracking-wide">
                {metric.label}
              </span>
              <span className="text-sm font-semibold tabular-nums text-foreground">
                {metric.value}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

const SCORE_STROKE_CLASS = {
  success: "stroke-success",
  warning: "stroke-warning",
  destructive: "stroke-destructive",
};

function ScoreGauge({ label, score }: { label: string; score: number | null }) {
  const displayScore = score ?? 0;
  const tone = scoreTone(score);
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const progress = (displayScore / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1.5 py-2">
      <div className="relative size-16">
        <svg viewBox="0 0 64 64" className="size-full -rotate-90">
          <circle
            cx="32"
            cy="32"
            r={radius}
            fill="none"
            strokeWidth="4"
            className="stroke-border"
          />
          {tone != null ? (
            <circle
              cx="32"
              cy="32"
              r={radius}
              fill="none"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${progress} ${circumference}`}
              className={SCORE_STROKE_CLASS[tone]}
            />
          ) : null}
        </svg>
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center text-lg font-bold",
            tone ? SCORE_TEXT_CLASS[tone] : "text-muted-foreground",
          )}
        >
          {score ?? "-"}
        </span>
      </div>
      <span className="text-[11px] text-muted-foreground text-center leading-tight">
        {label}
      </span>
    </div>
  );
}

function getMetricItems(metrics?: LighthouseMetrics | null) {
  if (!metrics) return [];

  return [
    { label: "FCP", value: metrics.firstContentfulPaint.displayValue },
    { label: "LCP", value: metrics.largestContentfulPaint.displayValue },
    { label: "TBT", value: metrics.totalBlockingTime.displayValue },
    { label: "SI", value: metrics.speedIndex.displayValue },
    { label: "TTI", value: metrics.timeToInteractive.displayValue },
    { label: "CLS", value: metrics.cumulativeLayoutShift.displayValue },
    { label: "INP", value: metrics.interactionToNextPaint.displayValue },
    { label: "TTFB", value: metrics.serverResponseTime.displayValue },
  ].filter(
    (metric): metric is { label: string; value: string } =>
      metric.value != null,
  );
}
