import { useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowRight,
  Check,
  ClipboardCopy,
  ExternalLink,
  Flame,
  MessageCircle,
  Quote,
} from "lucide-react";
import type {
  PaaMiningReport as PaaMiningReportType,
  PaaQuestion,
} from "@/server/features/paa-mining/services/PaaMiningService";

const INTENT_LABELS: Record<string, string> = {
  comparison: "Comparison",
  how_to: "How-to",
  what_is: "What is",
  why: "Why",
  when: "When",
  where: "Where",
  cost: "Cost",
  problem: "Problem",
  alternative: "Alternative",
  other: "Other",
};

const INTENT_COLORS: Record<string, string> = {
  comparison: "border-primary/30 bg-primary/10 text-primary",
  how_to: "border-success/30 bg-success/10 text-success",
  what_is: "border-info/30 bg-info/10 text-info",
  why: "border-warning/30 bg-warning/10 text-warning",
  when: "border-accent/30 bg-accent/10 text-accent",
  where: "border-accent/30 bg-accent/10 text-accent",
  cost: "border-warning/30 bg-warning/10 text-warning",
  problem: "border-error/30 bg-error/10 text-error",
  alternative: "border-primary/30 bg-primary/10 text-primary",
  other: "border-base-300 bg-base-200 text-base-content/60",
};

export function PaaMiningReport({ report }: { report: PaaMiningReportType }) {
  return (
    <div className="flex flex-col gap-5">
      {/* Demand signals summary — the headline value */}
      <DemandSignalsCard report={report} />

      {/* Question-by-question breakdown with social threads */}
      <QuestionsCard questions={report.questions} />

      {/* Markdown export for the copy-to-agent workflow */}
      <AgentBriefButton report={report} />
    </div>
  );
}

// ─── Demand signals ─────────────────────────────────────────────────────────

function DemandSignalsCard({ report }: { report: PaaMiningReportType }) {
  const groupsWithData = report.demandSignals.filter(
    (g) => g.phrases.length > 0 || g.painPoints.length > 0,
  );

  if (groupsWithData.length === 0) return null;

  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-3 p-5">
        <div className="flex items-center gap-2">
          <Flame className="size-4 text-warning" />
          <h2 className="text-base font-semibold">
            Demand signals — what people actually say
          </h2>
        </div>
        <p className="text-xs text-base-content/55">
          Language extracted from social threads answering the PAA questions for{" "}
          <span className="font-medium">"{report.seed}"</span>. These are the
          angles and pain points that keyword tools miss.
        </p>
        <div className="flex flex-col gap-3 pt-1">
          {groupsWithData.map((group) => (
            <div
              key={group.intent}
              className="rounded-[6px] border border-base-300 bg-base-200/40 p-3"
            >
              <div className="mb-2 flex items-center gap-2">
                <span
                  className={`rounded-[3px] border px-2 py-0.5 text-[11px] font-semibold ${INTENT_COLORS[group.intent] ?? INTENT_COLORS.other}`}
                >
                  {INTENT_LABELS[group.intent] ?? group.intent}
                </span>
              </div>
              {group.painPoints.length > 0 && (
                <div className="mb-2">
                  <div className="mb-1 flex items-center gap-1 text-[11px] font-medium text-base-content/60">
                    <AlertCircle className="size-3" />
                    Pain points
                  </div>
                  <ul className="flex flex-col gap-1">
                    {group.painPoints.map((p, i) => (
                      <li
                        key={i}
                        className="flex gap-2 text-[13px] leading-snug text-base-content/85"
                      >
                        <Quote className="mt-1 size-3 shrink-0 text-base-content/30" />
                        <span>"{p}"</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {group.phrases.length > 0 && (
                <div>
                  <div className="mb-1 flex items-center gap-1 text-[11px] font-medium text-base-content/60">
                    <MessageCircle className="size-3" />
                    Phrases people use
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {group.phrases.map((p, i) => (
                      <span
                        key={i}
                        className="rounded-[3px] border border-base-300 bg-base-100 px-2 py-0.5 text-[12px] text-base-content/80"
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Questions ──────────────────────────────────────────────────────────────

function QuestionsCard({ questions }: { questions: PaaQuestion[] }) {
  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-1 p-4">
        <div className="flex items-center gap-2 px-1 pb-2">
          <MessageCircle className="size-4 text-base-content/40" />
          <h2 className="text-sm font-semibold">
            Questions ({questions.length})
          </h2>
        </div>
        <div className="flex flex-col gap-2">
          {questions.map((q, i) => (
            <QuestionRow key={i} question={q} />
          ))}
        </div>
      </div>
    </div>
  );
}

function QuestionRow({ question }: { question: PaaQuestion }) {
  return (
    <div className="rounded-[6px] border border-base-300 bg-base-200/40 px-3 py-2">
      <div className="flex items-start gap-2">
        <span
          className={`mt-0.5 shrink-0 rounded-[3px] border px-1.5 py-0.5 text-[10px] font-semibold ${INTENT_COLORS[question.intent] ?? INTENT_COLORS.other}`}
        >
          {INTENT_LABELS[question.intent] ?? question.intent}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-base-content/90">
            {question.question}
          </p>
          {question.snippet && (
            <p className="mt-1 text-[12px] leading-snug text-base-content/60">
              {question.snippet}
            </p>
          )}
        </div>
      </div>
      {question.social.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5 border-t border-base-300 pt-2 pl-7">
          {question.social.slice(0, 4).map((thread, i) => (
            <a
              key={i}
              href={thread.link}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col gap-0.5 rounded-[4px] px-2 py-1 transition-colors hover:bg-base-100"
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={`rounded-[3px] border px-1 py-0 text-[9px] font-semibold uppercase ${
                    thread.source === "reddit"
                      ? "border-orange-400/40 bg-orange-400/10 text-orange-600"
                      : "border-red-400/40 bg-red-400/10 text-red-600"
                  }`}
                >
                  {thread.source}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-base-content/85 group-hover:text-primary">
                  {thread.title}
                </span>
                <ExternalLink className="size-3 shrink-0 text-base-content/30 group-hover:text-primary" />
              </div>
              {thread.snippet && (
                <p className="text-[11px] leading-snug text-base-content/55">
                  {thread.snippet}
                </p>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Agent brief export ─────────────────────────────────────────────────────

function AgentBriefButton({ report }: { report: PaaMiningReportType }) {
  const [copied, setCopied] = useState(false);

  const brief = renderAgentBrief(report);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(brief);
      setCopied(true);
      toast.success("Agent brief copied to clipboard.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  };

  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body flex-row items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2">
          <ArrowRight className="size-4 text-base-content/40" />
          <p className="text-sm text-base-content/80">
            Copy this as a markdown brief for your agent
          </p>
        </div>
        <button
          type="button"
          onClick={onCopy}
          className="btn btn-sm btn-primary"
        >
          {copied ? (
            <>
              <Check className="size-4" />
              Copied
            </>
          ) : (
            <>
              <ClipboardCopy className="size-4" />
              Copy brief
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function renderAgentBrief(report: PaaMiningReportType): string {
  const lines: string[] = [];
  lines.push(`# PAA + Social Mining — "${report.seed}"`);
  lines.push("");
  lines.push(`Region: ${report.region}`);
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");
  lines.push("## Demand signals (what people actually say)");
  lines.push("");
  for (const group of report.demandSignals) {
    if (group.phrases.length === 0 && group.painPoints.length === 0) continue;
    lines.push(`### ${INTENT_LABELS[group.intent] ?? group.intent}`);
    if (group.painPoints.length > 0) {
      lines.push("");
      lines.push("**Pain points:**");
      for (const p of group.painPoints) lines.push(`- "${p}"`);
    }
    if (group.phrases.length > 0) {
      lines.push("");
      lines.push("**Phrases people use:**");
      for (const p of group.phrases) lines.push(`- ${p}`);
    }
    lines.push("");
  }
  lines.push("## Questions");
  lines.push("");
  for (const q of report.questions) {
    lines.push(`- [${INTENT_LABELS[q.intent] ?? q.intent}] ${q.question}`);
    for (const t of q.social.slice(0, 3)) {
      lines.push(`  - ${t.source}: ${t.title} (${t.link})`);
    }
  }
  return lines.join("\n");
}
