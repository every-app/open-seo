import {
  Bookmark,
  Bot,
  ClipboardCheck,
  Globe,
  Link2,
  Search,
} from "lucide-react";

export const projectNavItems = [
  {
    to: "/p/$projectId/keywords" as const,
    label: "Keyword Research",
    icon: Search,
    matchSegment: "/keywords",
  },
  {
    to: "/p/$projectId/saved" as const,
    label: "Saved Keywords",
    icon: Bookmark,
    matchSegment: "/saved",
  },
  {
    to: "/p/$projectId/domain" as const,
    label: "Domain Overview",
    icon: Globe,
    matchSegment: "/domain",
  },
  {
    to: "/p/$projectId/backlinks" as const,
    label: "Backlinks",
    icon: Link2,
    matchSegment: "/backlinks",
  },
  {
    to: "/p/$projectId/audit" as const,
    label: "Site Audit",
    icon: ClipboardCheck,
    matchSegment: "/audit",
  },
  {
    to: "/p/$projectId/ai" as const,
    label: "AI",
    icon: Bot,
    matchSegment: "/ai",
  },
] as const;
