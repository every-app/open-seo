import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle,
  FileWarning,
  Info,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/client/components/ui/badge";
import { Spinner } from "@/client/components/ui/spinner";
import { getAuditCapabilities } from "@/serverFunctions/audit";
import type { IssueSeverity } from "@/shared/audit-issues";

export { formatDate, formatStartedAt } from "./date-format";

export function extractPathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

export function extractHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function StatusBadge({ status }: { status: string }) {
  if (status === "running") {
    return (
      <Badge variant="info">
        <Spinner /> Running
      </Badge>
    );
  }

  if (status === "completed") {
    return (
      <Badge variant="success">
        <CheckCircle /> Done
      </Badge>
    );
  }

  return (
    <Badge variant="destructive">
      <AlertCircle /> Failed
    </Badge>
  );
}

export function HttpStatusBadge({ code }: { code: number | null }) {
  if (!code) return <Badge variant="outline">-</Badge>;
  const variant =
    code >= 200 && code < 300
      ? "success"
      : code >= 300 && code < 400
        ? "warning"
        : "destructive";
  return <Badge variant={variant}>{code}</Badge>;
}

type ScoreTone = "success" | "warning" | "destructive";

/** Lighthouse score bands: 90 and up is good, 50 to 89 needs work, below 50 is poor. */
export function scoreTone(score: number | null): ScoreTone | null {
  if (score == null) return null;
  if (score >= 90) return "success";
  if (score >= 50) return "warning";
  return "destructive";
}

export const SCORE_TEXT_CLASS: Record<ScoreTone, string> = {
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
};

export function LighthouseScoreBadge({ score }: { score: number | null }) {
  const tone = scoreTone(score);
  if (tone == null) {
    return <span className="text-xs text-muted-foreground">-</span>;
  }
  return (
    <span className={cn("text-sm font-medium", SCORE_TEXT_CLASS[tone])}>
      {score}
    </span>
  );
}

const SEVERITY_BADGE: Record<
  IssueSeverity,
  { variant: "destructive" | "warning" | "info"; icon: LucideIcon }
> = {
  critical: { variant: "destructive", icon: FileWarning },
  warning: { variant: "warning", icon: TriangleAlert },
  info: { variant: "info", icon: Info },
};

/** The one way audit and Lighthouse pages show an issue severity. */
export function SeverityBadge({
  severity,
  children,
  title,
}: {
  severity: IssueSeverity;
  children: ReactNode;
  title?: string;
}) {
  const { variant, icon: Icon } = SEVERITY_BADGE[severity];
  return (
    <Badge variant={variant} title={title}>
      <Icon />
      {children}
    </Badge>
  );
}

/** Whether this deployment can render JavaScript in site audits. */
export function useAuditCapabilities(projectId: string) {
  return useQuery({
    queryKey: ["audit-capabilities", projectId],
    queryFn: () => getAuditCapabilities({ data: { projectId } }),
  });
}

/** What to do when a site's bot protection blocked the crawler. */
export function BotProtectionAdvice({
  projectId,
  rendered,
}: {
  projectId: string;
  /** Whether this audit already rendered JavaScript. */
  rendered: boolean;
}) {
  const canRender =
    useAuditCapabilities(projectId).data?.canRenderJavaScript === true;
  const desktopCrawlers = (
    <>
      <a
        href="https://github.com/PhialsBasement/LibreCrawl"
        target="_blank"
        rel="noreferrer"
      >
        LibreCrawl
      </a>{" "}
      or{" "}
      <a
        href="https://www.screamingfrog.co.uk/seo-spider/"
        target="_blank"
        rel="noreferrer"
      >
        Screaming Frog
      </a>
    </>
  );

  if (!rendered && canRender) {
    return (
      <>
        Turn on Render JavaScript and run the audit again. To avoid the extra
        cost, use a free desktop crawler like {desktopCrawlers}.
      </>
    );
  }
  return (
    <>
      {rendered ? "Rendering couldn't get past it. " : null}
      Try a free desktop crawler like {desktopCrawlers}.
    </>
  );
}
