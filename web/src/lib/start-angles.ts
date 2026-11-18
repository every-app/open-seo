/**
 * The Meta ads' landing pages, /start/<angle>. Each ad links to the page that
 * repeats its own headline. The site is prerendered, so every angle is its own
 * path rather than a query parameter.
 */
export const START_ANGLES = [
  "claude",
  "open-source",
  "rank",
  "semrush",
  "traffic",
] as const;

export type StartAngle = (typeof START_ANGLES)[number];
