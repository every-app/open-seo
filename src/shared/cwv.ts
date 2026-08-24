// "Good" ceilings for the three Core Web Vitals (web.dev/vitals). Lower is
// better for every metric. Shared (not a server module) so the dashboard card
// and the MCP tool rate p75s identically without the client bundling server
// code.
export const CWV_THRESHOLDS = { lcpMs: 2500, inpMs: 200, cls: 0.1 } as const;

export type CwvMetricKey = keyof typeof CWV_THRESHOLDS;

export function cwvRating(metric: CwvMetricKey, p75: number): "good" | "poor" {
  return p75 <= CWV_THRESHOLDS[metric] ? "good" : "poor";
}
