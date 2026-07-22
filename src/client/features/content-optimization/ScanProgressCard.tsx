import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";

/**
 * Staged progress for a running scan. The provider reports coarse progress;
 * stages also advance on elapsed time so the card keeps moving even when the
 * progress number stalls between phases.
 */
const STAGES = [
  { threshold: 0, afterSeconds: 0, label: "Fetching the live SERP" },
  { threshold: 25, afterSeconds: 4, label: "Crawling competitor pages" },
  { threshold: 55, afterSeconds: 10, label: "Running entity analysis" },
  {
    threshold: 85,
    afterSeconds: 20,
    label: "Scoring and building your report",
  },
];

export function ScanProgressCard({ progress }: { progress: number | null }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const activeIndex = STAGES.reduce(
    (active, stage, index) =>
      (progress !== null && progress >= stage.threshold) ||
      elapsed >= stage.afterSeconds
        ? index
        : active,
    0,
  );
  const shownProgress = Math.max(
    progress ?? 0,
    Math.min(8 + elapsed * 2.2, 92),
  );

  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-5 p-8">
        <div className="mx-auto w-full max-w-md space-y-5">
          <div className="h-2 w-full overflow-hidden rounded-[3px] bg-base-200">
            <div
              className="h-full rounded-[3px] bg-primary transition-all duration-700"
              style={{ width: `${shownProgress}%` }}
            />
          </div>
          <ul className="space-y-3">
            {STAGES.map((stage, index) => {
              const done = index < activeIndex;
              const active = index === activeIndex;
              return (
                <li
                  key={stage.label}
                  className={`flex items-center gap-3 text-sm transition-colors ${
                    done
                      ? "text-base-content/50"
                      : active
                        ? "font-medium"
                        : "text-base-content/30"
                  }`}
                >
                  <span className="flex size-5 shrink-0 items-center justify-center">
                    {done ? (
                      <Check className="size-4 text-success" />
                    ) : active ? (
                      <Loader2 className="size-4 animate-spin text-primary" />
                    ) : (
                      <span className="size-1.5 rounded-full bg-base-content/20" />
                    )}
                  </span>
                  {stage.label}
                </li>
              );
            })}
          </ul>
          <p className="text-center text-xs text-base-content/40">
            Scans usually finish in 30 seconds to 3 minutes.
          </p>
        </div>
      </div>
    </div>
  );
}
