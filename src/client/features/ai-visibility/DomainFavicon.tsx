/** A site's favicon, loaded from Google's public favicon service. */
export function DomainFavicon({ domain }: { domain: string }) {
  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`}
      alt=""
      className="size-4 shrink-0 rounded"
      loading="lazy"
    />
  );
}
