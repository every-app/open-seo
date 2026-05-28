import { ExternalLink } from "lucide-react";

import { getSafeExternalUrl } from "./table/url";

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
