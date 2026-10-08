import { z } from "zod";

// A report template's brand kit: a few colors and a logo that the server
// writes into a report's HTML as CSS custom properties when save_report names
// the template. The seo-report starter reads these tokens; a report written
// without a template keeps the starter's neutral defaults.

export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i, "Use a six-digit hex color such as #1c4ed8.");

/** The report sandbox allows `img-src data:` and nothing else, so the logo travels inline. */
export const logoDataUriSchema = z
  .string()
  .regex(
    /^data:image\/(png|webp|jpeg|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/,
    "Use a PNG, WebP, JPEG or SVG image encoded as a base64 data: URI.",
  );

export type ReportBrand = {
  brandColor: string | null;
  brandColor2: string | null;
  accentColor: string | null;
  canvasColor: string | null;
  logoDataUri: string | null;
};

/**
 * The starter's muted text and card colors. Brand colors are checked against
 * these, so they must match the seo-report starter CSS.
 */
export const REPORT_INK_MUTED = "#6b6b6b";
export const REPORT_SURFACE = "#ffffff";
/** WCAG AA for body text. */
export const REPORT_MIN_TEXT_CONTRAST = 4.5;

function relativeLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two #rrggbb colors, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const BRAND_STYLE_PATTERN = /<style id="openseo-brand">[\s\S]*?<\/style>/g;

/**
 * Writes the brand kit into a report as the last `:root` rule in its head, so
 * it overrides the starter's defaults. Any block from an earlier save is
 * replaced, so saving a revised report again never stacks two. Values are
 * interpolated into CSS, so callers pass only service-validated brands.
 */
export function applyReportBrand(html: string, brand: ReportBrand): string {
  const tokens = [
    brand.brandColor && `--brand:${brand.brandColor}`,
    brand.brandColor2 && `--brand-2:${brand.brandColor2}`,
    brand.accentColor && `--accent:${brand.accentColor}`,
    brand.canvasColor && `--canvas:${brand.canvasColor}`,
    brand.logoDataUri &&
      `--brand-logo:url("${brand.logoDataUri}");--brand-logo-display:block`,
  ].filter(Boolean);

  const unbranded = html.replace(BRAND_STYLE_PATTERN, "");
  if (tokens.length === 0) return unbranded;

  const block = `<style id="openseo-brand">:root{${tokens.join(";")}}</style>`;
  const lower = unbranded.toLowerCase();
  const headClose = lower.indexOf("</head>");
  const bodyOpen = lower.indexOf("<body");
  // Last resort: just inside <html, not before the doctype. With no <html at
  // all this prepends, and saveReport refuses that document anyway.
  const at =
    headClose !== -1
      ? headClose
      : bodyOpen !== -1
        ? bodyOpen
        : lower.indexOf(">", lower.indexOf("<html")) + 1;
  return unbranded.slice(0, at) + block + unbranded.slice(at);
}
