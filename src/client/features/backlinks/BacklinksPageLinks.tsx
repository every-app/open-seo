import { SafeExternalLink } from "@/client/components/SafeExternalLink";
import { extractUrlPath, truncateMiddle } from "./backlinksPageUtils";

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
    <SafeExternalLink
      url={url}
      label={truncateMiddle(extractUrlPath(url), maxLength)}
      className={`underline-offset-4 hover:underline break-all inline-flex items-center gap-1 ${muted ? "text-xs text-muted-foreground" : "text-sm"}`}
    />
  );
}
