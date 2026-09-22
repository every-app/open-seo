export const trafficTrend = [
  { label: "Aug 22", traffic: 10300, visibility: 52 },
  { label: "Aug 26", traffic: 11200, visibility: 54 },
  { label: "Aug 30", traffic: 11950, visibility: 57 },
  { label: "Sep 3", traffic: 13100, visibility: 59 },
  { label: "Sep 7", traffic: 14250, visibility: 63 },
  { label: "Sep 11", traffic: 15100, visibility: 66 },
  { label: "Sep 15", traffic: 16800, visibility: 69 },
  { label: "Sep 18", traffic: 18420, visibility: 72 },
];

export const positionBuckets = [
  { label: "Top 3", value: 86, color: "#34d399" },
  { label: "4–10", value: 214, color: "#22d3ee" },
  { label: "11–20", value: 337, color: "#818cf8" },
  { label: "21–100", value: 647, color: "#64748b" },
];

export const channelShare = [
  { name: "Organic", value: 58, color: "#34d399" },
  { name: "Direct", value: 24, color: "#22d3ee" },
  { name: "Referral", value: 11, color: "#818cf8" },
  { name: "Social", value: 7, color: "#f59e0b" },
];

export const opportunities = [
  {
    keyword: "digital marketing sri lanka",
    position: 11,
    volume: "2.4K",
    intent: "Commercial",
  },
  {
    keyword: "seo agency colombo",
    position: 14,
    volume: "880",
    intent: "Transactional",
  },
  {
    keyword: "social media marketing sri lanka",
    position: 18,
    volume: "1.3K",
    intent: "Commercial",
  },
] as const;
