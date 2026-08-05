/**
 * Mark for the Bing Webmaster Tools integration. Deliberately a neutral
 * search-tilt glyph rather than a redrawn Microsoft logo — the label always
 * says "Bing" next to it, so the mark identifies the row without passing
 * itself off as official brand artwork.
 */
export function BingGlyph({
  className,
  muted = false,
}: {
  className?: string;
  /** Render in currentColor so the mark inherits muted nav/icon styling. */
  muted?: boolean;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill={muted ? "currentColor" : "#0F7BBF"}
        d="M6 3.2 10 5v10.1l4.6-2.1-2.3-1.1-1.4-3.4 6.9 3v3.9L10 20.8 6 18.6V3.2Z"
      />
    </svg>
  );
}

/** Monochrome variant with a LucideIcon-compatible signature for nav slots. */
export function BingGlyphMuted({ className }: { className?: string }) {
  return <BingGlyph muted className={className} />;
}
