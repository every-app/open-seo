import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import {
  getPeopleAlsoAsk,
  getSocialThreads,
  isSerperConfigured,
  SerperApiError,
  verifySerperConnection,
} from "@/server/lib/serper/client";
import {
  MAX_PAA_QUESTIONS,
  MAX_SOCIAL_THREADS_PER_QUESTION,
  type PaaIntent,
  type PaaMiningRegion,
  type SocialSource,
} from "@/shared/paa-mining";
import { PaaScanRepository } from "../repositories/PaaScanRepository";
import { SerperConnectionRepository } from "../repositories/SerperConnectionRepository";

/**
 * PAA + Social Mining for demand discovery.
 *
 * The core insight: PAA boxes don't create new keyword demand — they're
 * reformulations of the seed. The real demand-discovery signal lives in what
 * people actually SAY in social threads answering those questions. So this
 * module:
 *
 *   1. Extracts the PAA questions for a seed keyword (Serper.dev).
 *   2. Clusters them by intent (comparison, how_to, what_is, ...).
 *   3. Mines Reddit/Quora threads answering each question.
 *   4. Surfaces the language, pain points, and angles that keyword tools miss
 *      — the "zero demand keywords" that PAA creates.
 *
 * Shared by the server functions and the MCP tools so both stay in lockstep.
 */

// ─── Report shape ────────────────────────────────────────────────────────────

export interface PaaQuestion {
  question: string;
  intent: PaaIntent;
  snippet: string | null;
  link: string | null;
  social: {
    source: SocialSource;
    title: string;
    link: string;
    snippet: string | null;
  }[];
}

export interface PaaMiningReport {
  seed: string;
  region: string;
  generatedAt: string;
  questions: PaaQuestion[];
  /** Language patterns surfaced from social threads — the demand-discovery
   * payload. Grouped by intent so the agent brief can cite "people actually
   * say X". */
  demandSignals: {
    intent: PaaIntent;
    phrases: string[];
    painPoints: string[];
  }[];
}

// Loose schema for re-reading a stored report from the `paa_scans.report`
// JSON text column. We don't revalidate the full structure every render —
// the report was just serialized from the same shape — but a type guard
// here keeps `parseStoredReport` from being an unsafe assertion.
const paaReportSchema = z.object({
  seed: z.string(),
  region: z.string(),
  generatedAt: z.string(),
  questions: z.array(
    z.object({
      question: z.string(),
      intent: z.string(),
      snippet: z.string().nullable(),
      link: z.string().nullable(),
      social: z.array(
        z.object({
          source: z.string(),
          title: z.string(),
          link: z.string(),
          snippet: z.string().nullable(),
        }),
      ),
    }),
  ),
  demandSignals: z.array(
    z.object({
      intent: z.string(),
      phrases: z.array(z.string()),
      painPoints: z.array(z.string()),
    }),
  ),
});

// zod's inference uses string for intent/source but the report shape is more
// narrow (PaaIntent/SocialSource literals). Coerce through a single cast at
// the boundary — we trust our own persisted payload (the same code just wrote
// it), and the only consumer is the UI which handles arbitrary strings fine.
type ParsedReport = z.infer<typeof paaReportSchema>;
function asPaaMiningReport(parsed: ParsedReport): PaaMiningReport {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see comment above
  return parsed as unknown as PaaMiningReport;
}

type PaaMiningView =
  | { status: "completed"; report: PaaMiningReport }
  | { status: "queued" | "running" | "processing"; progress: number | null }
  | {
      status: "failed" | "cancelled";
      error: { code: string | null; message: string | null } | null;
    };

function toAppError(error: unknown): never {
  if (error instanceof AppError) throw error;
  if (error instanceof SerperApiError) {
    if (error.status === 401) {
      throw new AppError("AUTH_CONFIG_MISSING", error.message);
    }
    if (error.status === 402) {
      throw new AppError("INSUFFICIENT_CREDITS", error.message);
    }
    if (error.status === 429) {
      throw new AppError("RATE_LIMITED", error.message);
    }
    throw new AppError("UPSTREAM_UNAVAILABLE", error.message);
  }
  throw error;
}

function parseStoredReport(raw: string): PaaMiningReport | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    const result = paaReportSchema.safeParse(parsed);
    return result.success ? asPaaMiningReport(result.data) : null;
  } catch {
    return null;
  }
}

// ─── Intent classification ───────────────────────────────────────────────────

const INTENT_PATTERNS: { intent: PaaIntent; patterns: RegExp[] }[] = [
  {
    intent: "comparison",
    patterns: [
      / vs /i,
      /\bversus\b/i,
      /\bor\b.*\bvs\b/i,
      /\bbetter\b/i,
      /\bdifference\b/i,
    ],
  },
  {
    intent: "cost",
    patterns: [
      /\bcost\b/i,
      /\bprice\b/i,
      /\bhow much\b/i,
      /\bfee\b/i,
      /\bexpensive\b/i,
    ],
  },
  {
    intent: "how_to",
    patterns: [
      /^how /i,
      /\bhow do i\b/i,
      /\bhow to\b/i,
      /\bstep\b/i,
      /\bguide\b/i,
    ],
  },
  {
    intent: "why",
    patterns: [/^why /i, /\breason\b/i, /\bbecause\b/i],
  },
  {
    intent: "when",
    patterns: [/^when /i, /\bhow long\b/i, /\btime\b/i, /\bhow often\b/i],
  },
  {
    intent: "where",
    patterns: [/^where /i, /\bnear me\b/i, /\blocation\b/i],
  },
  {
    intent: "problem",
    patterns: [
      /\bproblem\b/i,
      /\bissue\b/i,
      /\bfail\b/i,
      /\bnot working\b/i,
      /\berror\b/i,
      /\btrouble\b/i,
    ],
  },
  {
    intent: "alternative",
    patterns: [
      /\balternative\b/i,
      /\binstead\b/i,
      /\breplace\b/i,
      /\bsubstitute\b/i,
    ],
  },
  {
    intent: "what_is",
    patterns: [/^what /i, /\bwhat is\b/i, /\bwhat are\b/i, /\bdefinition\b/i],
  },
];

function classifyIntent(question: string): PaaIntent {
  for (const { intent, patterns } of INTENT_PATTERNS) {
    if (patterns.some((p) => p.test(question))) return intent;
  }
  return "other";
}

// ─── Demand signal extraction ───────────────────────────────────────────────

const PAIN_WORDS = [
  "frustrat",
  "annoy",
  "hate",
  "waste",
  "expensive",
  "overpriced",
  "slow",
  "broken",
  "confus",
  "hard",
  "difficult",
  "struggl",
  "fail",
  "error",
  "issue",
  "problem",
  "scam",
  "rip off",
  "disappoint",
];

function extractPhrases(snippets: string[]): string[] {
  const phrases = new Set<string>();
  for (const snippet of snippets) {
    if (!snippet) continue;
    // Pull short noun-phrase-ish windows (3-6 words) that carry signal.
    const matches = snippet.match(/\b([A-Z][a-z]+(?:\s+[a-z]+){1,4})\b/g);
    if (matches) {
      for (const m of matches) {
        if (m.length > 8 && m.length < 60) phrases.add(m);
      }
    }
  }
  return [...phrases].slice(0, 12);
}

function extractPainPoints(snippets: string[]): string[] {
  const points = new Set<string>();
  for (const snippet of snippets) {
    if (!snippet) continue;
    const lower = snippet.toLowerCase();
    for (const word of PAIN_WORDS) {
      if (lower.includes(word)) {
        // Grab a window around the pain word.
        const idx = lower.indexOf(word);
        const start = Math.max(0, idx - 40);
        const end = Math.min(snippet.length, idx + 60);
        points.add(snippet.slice(start, end).trim());
        break;
      }
    }
  }
  return [...points].slice(0, 8);
}

// ─── Service ────────────────────────────────────────────────────────────────

export const PaaMiningService = {
  async connectionStatus(): Promise<{
    enabled: boolean;
    configured: boolean;
    ok: boolean;
    message?: string;
  }> {
    const { enabled } = await SerperConnectionRepository.getState();
    if (!(await isSerperConfigured())) {
      return { enabled, configured: false, ok: false };
    }
    const verified = await verifySerperConnection();
    return {
      enabled,
      configured: true,
      ok: verified.ok,
      message: verified.message,
    };
  },

  /** Deployment-wide feature switch. Disabled hides the sidebar item and the
   * page, and the MCP tools answer with a clear disabled message. */
  async isModuleEnabled(): Promise<boolean> {
    return (await SerperConnectionRepository.getState()).enabled;
  },

  async setModuleEnabled(enabled: boolean): Promise<{ enabled: boolean }> {
    await SerperConnectionRepository.setEnabled(enabled);
    return { enabled };
  },

  /**
   * Run a full PAA + social mining scan. Synchronous (Serper.dev is fast —
   * ~1 call for PAA + ~3 per question for social), so the report is returned
   * directly and persisted for history.
   */
  async runScan(input: {
    projectId: string;
    seed: string;
    region?: PaaMiningRegion;
  }): Promise<{ scanId: string; report: PaaMiningReport }> {
    try {
      const scanId = crypto.randomUUID();
      const region = input.region ?? "US";

      // 1. Extract PAA questions.
      const paa = await getPeopleAlsoAsk({
        keyword: input.seed,
        region,
      });
      const questions = paa.slice(0, MAX_PAA_QUESTIONS);

      // 2. Mine social threads for each question.
      const mined: PaaQuestion[] = [];
      for (const q of questions) {
        const social: PaaQuestion["social"] = [];
        for (const source of ["reddit", "quora"] as SocialSource[]) {
          const threads = await getSocialThreads({
            question: q.question,
            source,
            region,
            num: MAX_SOCIAL_THREADS_PER_QUESTION,
          });
          for (const t of threads) {
            social.push({
              source,
              title: t.title,
              link: t.link,
              snippet: t.snippet,
            });
          }
        }
        mined.push({
          question: q.question,
          intent: classifyIntent(q.question),
          snippet: q.snippet,
          link: q.link,
          social,
        });
      }

      // 3. Build demand signals grouped by intent.
      const byIntent = new Map<PaaIntent, string[]>();
      for (const q of mined) {
        const snippets = q.social.map((s) => s.snippet ?? "").filter(Boolean);
        const existing = byIntent.get(q.intent) ?? [];
        byIntent.set(q.intent, [...existing, ...snippets]);
      }
      const demandSignals = [...byIntent.entries()].map(
        ([intent, snippets]) => ({
          intent,
          phrases: extractPhrases(snippets),
          painPoints: extractPainPoints(snippets),
        }),
      );

      const report: PaaMiningReport = {
        seed: input.seed,
        region,
        generatedAt: new Date().toISOString(),
        questions: mined,
        demandSignals,
      };

      // 4. Persist for history.
      await PaaScanRepository.insertPending({
        projectId: input.projectId,
        scanId,
        seed: input.seed,
        region,
      });
      await PaaScanRepository.saveReport({
        scanId,
        questionCount: mined.length,
        report: JSON.stringify(report),
      });

      return { scanId, report };
    } catch (error) {
      toAppError(error);
    }
  },

  async listHistory(projectId: string) {
    return PaaScanRepository.listForProject(projectId);
  },

  async deleteScan(projectId: string, scanId: string): Promise<void> {
    await PaaScanRepository.deleteForProject(projectId, scanId);
  },

  async getView(projectId: string, scanId: string): Promise<PaaMiningView> {
    const stored = await PaaScanRepository.getForProjectByScanId(
      projectId,
      scanId,
    );
    if (stored?.report) {
      const report = parseStoredReport(stored.report);
      if (report) return { status: "completed", report };
    }
    return {
      status: "failed",
      error: {
        code: "NOT_FOUND",
        message: "Scan not found or not yet complete.",
      },
    };
  },
};
