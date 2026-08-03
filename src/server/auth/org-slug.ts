export function slugify(value: string) {
  // Truncate before trimming dashes so a cut that lands on a "-" separator
  // does not leave a leading or trailing dash in the final slug.
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 48)
    .replace(/^-+|-+$/g, "");

  return slug || "workspace";
}

export function toHex(value: string) {
  return Array.from(new TextEncoder().encode(value), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
