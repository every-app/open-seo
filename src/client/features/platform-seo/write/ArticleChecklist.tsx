import { CheckCircle2, Circle } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import { type Check, type checkArticle, TARGET_WORDS } from "./checkArticle";

export function ArticleChecklist({
  checks,
}: {
  checks: ReturnType<typeof checkArticle>;
}) {
  const { wordCount } = checks;
  const lengthHint =
    wordCount < TARGET_WORDS.min
      ? `Aim for ${TARGET_WORDS.min.toLocaleString()} to ${TARGET_WORDS.max.toLocaleString()}.`
      : wordCount > TARGET_WORDS.max
        ? "Longer than the brief needs; trim if it repeats."
        : "In the target range.";
  return (
    <Card size="sm" className="h-fit xl:sticky xl:top-4">
      <CardHeader>
        <CardTitle>Checklist</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <div>
          <p className="text-2xl font-semibold tabular-nums">
            {wordCount.toLocaleString()}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              words · {Math.max(1, Math.round(wordCount / 230))} min read
            </span>
          </p>
          <p className="text-xs text-muted-foreground">{lengthHint}</p>
        </div>
        <CheckGroup title="Target keyword" checks={checks.keywordChecks} />
        <CheckGroup
          title="Outline sections"
          checks={checks.outlineChecks}
          hint="A heading that shares most of the section's words."
        />
        <CheckGroup
          title="Questions answered"
          checks={checks.questionChecks}
          hint="Every word of the question appears in one section."
        />
        <CheckGroup
          title="Supporting keywords"
          checks={checks.supportingChecks}
          hint="Use the ones that read naturally; all of them is not the goal."
        />
      </CardContent>
    </Card>
  );
}

function CheckGroup({
  title,
  checks,
  hint,
}: {
  title: string;
  checks: Check[];
  hint?: string;
}) {
  if (checks.length === 0) return null;
  const done = checks.filter((c) => c.done).length;
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-xs font-medium text-muted-foreground">
        {title} ({done}/{checks.length})
      </h3>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      <ul className="flex flex-col gap-1">
        {checks.map((check) => (
          <li key={check.label} className="flex items-start gap-2">
            {check.done ? (
              <CheckCircle2
                className="mt-0.5 size-4 shrink-0 text-success"
                aria-label="Done"
              />
            ) : (
              <Circle
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-label="Not yet"
              />
            )}
            <span className={check.done ? "" : "text-muted-foreground"}>
              {check.label}
              {check.detail ? (
                <span className="text-muted-foreground"> · {check.detail}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
