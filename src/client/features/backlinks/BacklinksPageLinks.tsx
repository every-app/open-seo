import { ExternalLink } from "lucide-react";
import { extractUrlPath, truncateMiddle } from "./backlinksPageUtils";

export function BacklinksExternalLink({
  url,
  label,
  className,
}: {
  url: string;
  label: string;
  className: string;
}) {
  const safeUrl = getSafeExternalUrl(url);
  if (!safeUrl) {
    return <span className={className}>{label}</span>;
  }

  return (
    <a className={className} href={safeUrl} target="_blank" rel="noreferrer">
      {label}
      <ExternalLink className="size-3 shrink-0" />
    </a>
  );
}

export function BacklinksSourceLink({
  url,
  maxLength,
  muted = false,
}: {
  url: string;
  maxLength: number;
  muted?: boolean;
}) {
  return (
    <BacklinksExternalLink
      url={url}
      label={truncateMiddle(extractUrlPath(url), maxLength)}
      className={`link link-hover break-all inline-flex items-center gap-1 ${muted ? "text-xs text-base-content/55" : "text-sm"}`}
    />
  );
}

function getSafeExternalUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}
