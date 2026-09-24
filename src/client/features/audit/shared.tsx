import { AlertCircle, CheckCircle, Loader2 } from "@/client/components/icons";

import { Badge } from "@/client/components/ui/badge";
export const SUPPORT_EMAIL = "ben@openseo.so";

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

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatStartedAt(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function StatusBadge({ status }: { status: string }) {
  if (status === "running") {
    return (
      <Badge variant="default" className="px-2 text-[11px] gap-1">
        <Loader2 className="size-3 animate-spin" /> Running
      </Badge>
    );
  }

  if (status === "completed") {
    return (
      <Badge variant="success" className="px-2 text-[11px] gap-1">
        <CheckCircle className="size-3" /> Done
      </Badge>
    );
  }

  return (
    <Badge variant="destructive" className="px-2 text-[11px] gap-1">
      <AlertCircle className="size-3" /> Failed
    </Badge>
  );
}

export function HttpStatusBadge({ code }: { code: number | null }) {
  if (!code)
    return (
      <Badge variant="secondary" className="px-2 text-[11px]">
        -
      </Badge>
    );
  if (code >= 200 && code < 300) {
    return (
      <Badge variant="success" className="px-2 text-[11px]">
        {code}
      </Badge>
    );
  }
  if (code >= 300 && code < 400) {
    return (
      <Badge variant="warning" className="px-2 text-[11px]">
        {code}
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="px-2 text-[11px]">
      {code}
    </Badge>
  );
}

export function LighthouseScoreBadge({ score }: { score: number | null }) {
  if (score == null) {
    return <span className="text-xs text-muted-foreground">-</span>;
  }
  const color =
    score >= 90
      ? "text-success"
      : score >= 50
        ? "text-warning"
        : "text-negative";
  return <span className={`font-medium text-sm ${color}`}>{score}</span>;
}
