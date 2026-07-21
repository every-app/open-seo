export type CompetitorPageType =
  | "homepage"
  | "product"
  | "category"
  | "asset/fiat landing page"
  | "converter/tool"
  | "comparison"
  | "guide/blog"
  | "documentation"
  | "business/enterprise";

export type CompetitorPageSnapshot = {
  url: string;
  title: string | null;
  metaDescription: string | null;
  wordCount: number | null;
  contentHash: string | null;
  statusCode: number | null;
};

export type CompetitorAuditRef = {
  id: string;
  startedAt: string;
};

export type CompetitorPageChange = {
  url: string;
  changeType: "added" | "removed" | "materially_changed";
  pageType: CompetitorPageType;
  title: string | null;
  evidence: string;
  measurement: "measured";
  source: "site_audit";
  current?: CompetitorPageSnapshot;
  previous?: CompetitorPageSnapshot;
};

export function classifyCompetitorPageType(input: {
  url: string;
  title?: string | null;
}): CompetitorPageType {
  const url = input.url.toLowerCase();
  const title = (input.title ?? "").toLowerCase();
  const path = new URL(input.url).pathname.replace(/\/+$/, "") || "/";

  if (path === "/") return "homepage";
  if (/blog|guide|learn|academy|news|article/.test(path + " " + title)) {
    return "guide/blog";
  }
  if (/docs|documentation|developers|api/.test(path + " " + title)) {
    return "documentation";
  }
  if (/business|enterprise|institutional|b2b|otc/.test(path + " " + title)) {
    return "business/enterprise";
  }
  if (/compare|vs\b|versus/.test(path + " " + title)) return "comparison";
  if (/convert|converter|calculator|tool/.test(path + " " + title)) {
    return "converter/tool";
  }
  if (
    /usdt|usdc|btc|eth|xrp|eur|usd|aed|inr|gbp|cad|aud|sgd|buy|sell|onramp|offramp/.test(
      path + " " + title,
    )
  ) {
    return "asset/fiat landing page";
  }
  if (/pricing|features|product|platform|solutions/.test(path + " " + title)) {
    return "product";
  }
  return "category";
}

function hasMaterialDifference(
  current: CompetitorPageSnapshot,
  previous: CompetitorPageSnapshot,
) {
  if (current.contentHash && previous.contentHash) {
    return current.contentHash !== previous.contentHash;
  }
  if ((current.title ?? "") !== (previous.title ?? "")) return true;
  if ((current.metaDescription ?? "") !== (previous.metaDescription ?? "")) {
    return true;
  }
  const currentWords = current.wordCount ?? 0;
  const previousWords = previous.wordCount ?? 0;
  return Math.abs(currentWords - previousWords) >= 150;
}

export function summarizeCompetitorAuditChanges(input: {
  currentAudit: CompetitorAuditRef;
  previousAudit: CompetitorAuditRef | null;
  currentPages: CompetitorPageSnapshot[];
  previousPages: CompetitorPageSnapshot[];
  limit: number;
}) {
  if (!input.previousAudit) {
    return {
      currentAuditId: input.currentAudit.id,
      previousAuditId: null,
      changes: [] as CompetitorPageChange[],
      summary: { total: 0, added: 0, removed: 0, materiallyChanged: 0 },
    };
  }

  const currentByUrl = new Map(input.currentPages.map((page) => [page.url, page]));
  const previousByUrl = new Map(
    input.previousPages.map((page) => [page.url, page]),
  );

  const changes: CompetitorPageChange[] = [];

  for (const [url, current] of currentByUrl.entries()) {
    const previous = previousByUrl.get(url);
    if (!previous) {
      changes.push({
        url,
        changeType: "added",
        pageType: classifyCompetitorPageType(current),
        title: current.title,
        evidence: `Page is present in audit ${input.currentAudit.id} but not in ${input.previousAudit.id}.`,
        measurement: "measured",
        source: "site_audit",
        current,
      });
      continue;
    }
    if (hasMaterialDifference(current, previous)) {
      changes.push({
        url,
        changeType: "materially_changed",
        pageType: classifyCompetitorPageType(current),
        title: current.title,
        evidence: `Page content changed between audits ${input.previousAudit.id} and ${input.currentAudit.id}.`,
        measurement: "measured",
        source: "site_audit",
        current,
        previous,
      });
    }
  }

  for (const [url, previous] of previousByUrl.entries()) {
    if (currentByUrl.has(url)) continue;
    changes.push({
      url,
      changeType: "removed",
      pageType: classifyCompetitorPageType(previous),
      title: previous.title,
      evidence: `Page was present in audit ${input.previousAudit.id} but not in ${input.currentAudit.id}.`,
      measurement: "measured",
      source: "site_audit",
      previous,
    });
  }

  const sorted = changes
    .toSorted((a, b) => a.url.localeCompare(b.url))
    .slice(0, input.limit);

  return {
    currentAuditId: input.currentAudit.id,
    previousAuditId: input.previousAudit.id,
    changes: sorted,
    summary: {
      total: sorted.length,
      added: sorted.filter((change) => change.changeType === "added").length,
      removed: sorted.filter((change) => change.changeType === "removed").length,
      materiallyChanged: sorted.filter(
        (change) => change.changeType === "materially_changed",
      ).length,
    },
  };
}
