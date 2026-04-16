import { ExternalLink } from "lucide-react";

export function SafeExternalLink({
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
