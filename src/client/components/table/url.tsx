import { ExternalLink } from "lucide-react";
import { safeHttpUrl } from "@/shared/safe-url";

export function formatUrlForDisplay(value: string): string {
  try {
    const url = new URL(value);
    const hash = url.hash.startsWith("#:~:") ? "" : url.hash;
    const cleaned = `${url.protocol}//${url.host}${url.pathname}${url.search}${hash}`;
    try {
      return decodeURI(cleaned);
    } catch {
      return cleaned;
    }
  } catch {
    return value;
  }
}

export function resolveUrlHref(
  value: string | null | undefined,
  baseDomain?: string,
): string | null {
  if (!value) return null;
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value)) {
    return safeHttpUrl(value);
  }
  if (!baseDomain) return null;
  return safeHttpUrl(
    `https://${baseDomain}${value.startsWith("/") ? value : `/${value}`}`,
  );
}

export function ExternalUrlCell({
  value,
  label,
  baseDomain,
}: {
  value: string | null | undefined;
  label: string;
  baseDomain?: string;
}) {
  const href = resolveUrlHref(value, baseDomain);
  if (!value || !href) {
    return <span className="text-muted-foreground">-</span>;
  }

  return (
    <a
      className="inline-flex max-w-full items-center gap-1 text-primary underline-offset-4 hover:underline"
      href={href}
      target="_blank"
      rel="noreferrer"
    >
      <span className="truncate">{label}</span>
      <ExternalLink className="size-3 shrink-0" />
    </a>
  );
}
