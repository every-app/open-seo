import { sort } from "remeda";
import type {
  AiBrandSummary,
  AiObservationRow,
  AiResults,
} from "./ai-visibility";

/** Mention and citation rates over answered collections, one row per brand. */
export function summarizeAiBrands(rows: AiObservationRow[]): AiBrandSummary[] {
  const summaries = new Map<string, AiBrandSummary>();
  for (const row of rows) {
    if (row.answerStatus !== "answered") continue;
    // Position = order of each brand's first mention in this answer.
    const mentionOrder = sort(
      row.brands.filter((b) => b.firstMention !== null),
      (a, b) => (a.firstMention ?? 0) - (b.firstMention ?? 0),
    ).map((b) => b.domain);
    for (const b of row.brands) {
      const summary = summaries.get(b.domain) ?? {
        name: b.name,
        domain: b.domain,
        own: b.own,
        answers: 0,
        mentions: 0,
        citations: 0,
        positionTotal: 0,
        positionCount: 0,
      };
      summary.answers++;
      if (b.mentioned) summary.mentions++;
      if (b.cited) summary.citations++;
      const position = mentionOrder.indexOf(b.domain) + 1;
      if (position > 0) {
        summary.positionTotal += position;
        summary.positionCount++;
      }
      summaries.set(b.domain, summary);
    }
  }
  return sort(
    [...summaries.values()],
    (a, b) => Number(b.own) - Number(a.own) || a.name.localeCompare(b.name),
  );
}

export function aiAnswerCoverage(
  rows: AiObservationRow[],
): AiResults["coverage"] {
  return {
    expected: rows.length,
    completed: rows.filter((o) => o.answerStatus === "answered").length,
    noAnswer: rows.filter((o) => o.answerStatus === "no_answer").length,
    failed: rows.filter((o) => o.status === "failed").length,
    pending: rows.filter((o) => o.status === "pending").length,
  };
}
