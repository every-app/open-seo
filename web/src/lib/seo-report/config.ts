import type { FreeToolBudget } from "@/lib/free-tools/budget";
import {
  SEO_REPORT_MODEL_PRICES,
  type ModelPrice,
} from "@/lib/free-tools/spend";
import type { SeoReportDesk } from "./desk";
import type { ReportParams } from "./workflow";

// What the SEO report tool reads from the Worker. It needs its secrets and a
// priced model to work; docs/maintainers/free-seo-report.md lists them.

export interface SeoReportEnv {
  /** Local development only: see StandIn. */
  SEO_REPORT_STAND_INS?: string;
  /** Comma-separated origins of other sites whose forms may submit here. */
  SEO_REPORT_PARTNER_ORIGINS: string;
  /** The OpenRouter model that writes a report, one of SEO_REPORT_MODEL_PRICES, and its reasoning effort. */
  SEO_REPORT_MODEL: string;
  SEO_REPORT_MODEL_EFFORT: string;
  OPENROUTER_API_KEY?: string;
  DATAFORSEO_API_KEY?: string;
  LOOPS_API_KEY?: string;
  LOOPS_SEO_REPORT_READY_ID?: string;
  LOOPS_SEO_REPORT_FAILED_ID?: string;
  SEO_REPORT_DESK: DurableObjectNamespace<SeoReportDesk>;
  SEO_REPORT_WORKFLOW: Workflow<ReportParams>;
  FREE_TOOL_BUDGET: DurableObjectNamespace<FreeToolBudget>;
}

const MODEL_SECRETS = ["OPENROUTER_API_KEY", "DATAFORSEO_API_KEY"] as const;
const EMAIL_SECRETS = [
  "LOOPS_API_KEY",
  "LOOPS_SEO_REPORT_READY_ID",
  "LOOPS_SEO_REPORT_FAILED_ID",
] as const;
type SecretName =
  | (typeof MODEL_SECRETS)[number]
  | (typeof EMAIL_SECRETS)[number];

/** What a local run can replace, named in SEO_REPORT_STAND_INS, comma-separated. */
export enum StandIn {
  /** A model that calls nothing and hands in a made-up report. Spends nothing. */
  Model = "model",
  /** Emails are logged instead of sent. */
  Email = "email",
}

/** Local development only. A production build ignores SEO_REPORT_STAND_INS. */
export const usesStandIn = (env: SeoReportEnv, part: StandIn) =>
  import.meta.env.DEV &&
  (env.SEO_REPORT_STAND_INS ?? "").split(",").includes(part);

/**
 * Whether the tool can take a request: every secret it needs is set and its
 * model has prices. When it can't, that is a misconfiguration, and the log
 * line names what is missing.
 */
export function reportsOpen(env: SeoReportEnv): boolean {
  const needed = [
    ...(usesStandIn(env, StandIn.Model) ? [] : MODEL_SECRETS),
    ...(usesStandIn(env, StandIn.Email) ? [] : EMAIL_SECRETS),
  ];
  const missing: string[] = needed.filter((name) => !env[name]?.trim());
  if (!reportModelConfig(env)) missing.push("SEO_REPORT_MODEL");
  if (missing.length) {
    console.error(
      JSON.stringify({ event: "seo_report_not_configured", missing }),
    );
    return false;
  }
  return true;
}

/** The secret, or an error naming it. For code that only runs while reports are open. */
export function secret(env: SeoReportEnv, name: SecretName): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export type ModelConfig = ModelPrice & { id: string; effort: string };

/**
 * The model that writes a report, with its prices, or null when
 * SEO_REPORT_MODEL names one that has none (free-tools/spend.ts). A run
 * counts what it has spent from those prices (write.ts), so a model without
 * them is not one the tool will start with.
 */
export function reportModelConfig(env: SeoReportEnv): ModelConfig | null {
  const price = SEO_REPORT_MODEL_PRICES[env.SEO_REPORT_MODEL];
  const effort = env.SEO_REPORT_MODEL_EFFORT?.trim();
  return price && effort
    ? { id: env.SEO_REPORT_MODEL, effort, ...price }
    : null;
}

/** The desk is one object for the whole tool. */
export function desk(env: SeoReportEnv) {
  // Placed in North America on first use: the Workflow it starts runs near
  // it, and OpenRouter refuses OpenAI models from some regions.
  return env.SEO_REPORT_DESK.get(env.SEO_REPORT_DESK.idFromName("desk"), {
    locationHint: "enam",
  });
}

/** The hostnames of the sites whose forms may submit, from SEO_REPORT_PARTNER_ORIGINS. */
export const partnerOrigins = (env: SeoReportEnv) =>
  env.SEO_REPORT_PARTNER_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
