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

// `label`/`helpKey` are i18n key paths (translated at render time in
// Sidebar.tsx via useTranslation), not display text — keeps this file
// language-agnostic.
const projectNavItems = [
  {
    to: "/p/$projectId" as const,
    label: "nav.items.dashboard.label",
    helpKey: "nav.items.dashboard.help",
    icon: LayoutDashboard,
    // Without exact matching, the index path is a prefix of every project
    // route and the Dashboard item would render active everywhere.
    activeOptions: { exact: true, includeSearch: false },
  },
  {
    to: "/p/$projectId/keywords" as const,
    label: "nav.items.keywords.label",
    helpKey: "nav.items.keywords.help",
    icon: Search,
  },
  {
    to: "/p/$projectId/saved" as const,
    label: "nav.items.saved.label",
    helpKey: "nav.items.saved.help",
    icon: Bookmark,
  },
  {
    to: "/p/$projectId/rank-tracking" as const,
    label: "nav.items.rankTracking.label",
    helpKey: "nav.items.rankTracking.help",
    icon: TrendingUp,
  },
  {
    to: "/p/$projectId/search-performance" as const,
    label: "nav.items.gscInsights.label",
    helpKey: "nav.items.gscInsights.help",
    icon: GoogleGlyphMuted,
  },
  {
    to: "/p/$projectId/domain" as const,
    label: "nav.items.domain.label",
    helpKey: "nav.items.domain.help",
    icon: Globe,
  },
  {
    to: "/p/$projectId/backlinks" as const,
    label: "nav.items.backlinks.label",
    helpKey: "nav.items.backlinks.help",
    icon: Link2,
  },
  {
    to: "/p/$projectId/audit" as const,
    label: "nav.items.audit.label",
    helpKey: "nav.items.audit.help",
    icon: ClipboardCheck,
  },
  {
    to: "/p/$projectId/brand-lookup" as const,
    label: "nav.items.brandLookup.label",
    helpKey: "nav.items.brandLookup.help",
    icon: Sparkles,
  },
  {
    to: "/p/$projectId/prompt-explorer" as const,
    label: "nav.items.promptExplorer.label",
    helpKey: "nav.items.promptExplorer.help",
    icon: MessageSquare,
  },
] as const;

const aiNavItem = linkOptions({
  to: "/ai" as const,
  label: "nav.items.aiMcp.label",
  helpKey: "nav.items.aiMcp.help",
  icon: Bot,
});

// Always-visible sidebar group (not project-scoped, unlike the groups below).
export const connectNavGroup = {
  label: "nav.groups.connect",
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
      label: "nav.groups.overview",
      items: [byPath("/p/$projectId")],
    },
    {
      label: "nav.groups.research",
      items: [
        byPath("/p/$projectId/keywords"),
        byPath("/p/$projectId/domain"),
        byPath("/p/$projectId/backlinks"),
        byPath("/p/$projectId/brand-lookup"),
        byPath("/p/$projectId/prompt-explorer"),
      ],
    },
    {
      label: "nav.groups.mySite",
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
