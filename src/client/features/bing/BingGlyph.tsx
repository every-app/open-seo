/** Bing "b" brand mark, shared across the Bing Webmaster connect surfaces. */
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
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill={muted ? "currentColor" : "#008373"}
        d="M9 4l11 3.9v27.3l9.5-5.5V17l7.2 4.2v14.4L21 44l-12-6.9V4z"
      />
    </svg>
  );
}

/** Monochrome variant with a LucideIcon-compatible signature for nav slots. */
export function BingGlyphMuted({ className }: { className?: string }) {
  return <BingGlyph muted className={className} />;
}
