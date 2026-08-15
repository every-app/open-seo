import {
  Bookmark,
  Bot,
  ClipboardCheck,
  Globe,
  LayoutDashboard,
  Link2,
  MessageSquare,
  Search,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { linkOptions } from "@tanstack/react-router";
import { GoogleGlyphMuted } from "@/client/features/gsc/GoogleGlyph";

const projectNavItems = [
  {
    to: "/p/$projectId" as const,
    label: "仪表盘",
    icon: LayoutDashboard,
    // Without exact matching, the index path is a prefix of every project
    // route and the Dashboard item would render active everywhere.
    activeOptions: { exact: true, includeSearch: false },
  },
  {
    to: "/p/$projectId/keywords" as const,
    label: "关键词研究",
    icon: Search,
  },
  {
    to: "/p/$projectId/saved" as const,
    label: "已保存关键词",
    icon: Bookmark,
  },
  {
    to: "/p/$projectId/rank-tracking" as const,
    label: "排名追踪",
    icon: TrendingUp,
  },
  {
    to: "/p/$projectId/search-performance" as const,
    label: "GSC 洞察",
    icon: GoogleGlyphMuted,
  },
  {
    to: "/p/$projectId/domain" as const,
    label: "域名概览",
    icon: Globe,
  },
  {
    to: "/p/$projectId/backlinks" as const,
    label: "反向链接",
    icon: Link2,
  },
  {
    to: "/p/$projectId/audit" as const,
    label: "站点审计",
    icon: ClipboardCheck,
  },
  {
    to: "/p/$projectId/brand-lookup" as const,
    label: "品牌查询",
    icon: Sparkles,
  },
  {
    to: "/p/$projectId/prompt-explorer" as const,
    label: "提示词探索",
    icon: MessageSquare,
  },
] as const;

const aiNavItem = linkOptions({
  to: "/ai" as const,
  label: "AI 与 MCP",
  icon: Bot,
});

// Always-visible sidebar group (not project-scoped, unlike the groups below).
export const connectNavGroup = {
  label: "连接",
  items: [aiNavItem],
};

function getProjectNavItems(projectId: string) {
  return linkOptions(
    projectNavItems.map((item) => ({
      ...item,
      params: { projectId },
      search: {},
    })),
  );
}

// Grouped by scope: "My Site" is the project's own domain (tracked data),
// "Research" is point-at-anything lookup tools.
export function getProjectNavGroups(projectId: string) {
  const all = getProjectNavItems(projectId);
  const byPath = (path: (typeof projectNavItems)[number]["to"]) =>
    all.find((i) => i.to === path)!;

  return [
    {
      label: "概览",
      items: [byPath("/p/$projectId")],
    },
    {
      label: "研究",
      items: [
        byPath("/p/$projectId/keywords"),
        byPath("/p/$projectId/domain"),
        byPath("/p/$projectId/backlinks"),
        byPath("/p/$projectId/brand-lookup"),
        byPath("/p/$projectId/prompt-explorer"),
      ],
    },
    {
      label: "我的网站",
      items: [
        byPath("/p/$projectId/search-performance"),
        byPath("/p/$projectId/rank-tracking"),
        byPath("/p/$projectId/saved"),
        byPath("/p/$projectId/audit"),
      ],
    },
  ];
}

export const dataforseoHelpLinkOptions = linkOptions({
  to: "/help/dataforseo-api-key",
});
