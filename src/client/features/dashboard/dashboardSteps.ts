import {
  Bot,
  ClipboardCheck,
  FolderPlus,
  Globe,
  Lightbulb,
  Users,
} from "lucide-react";
import type { DashboardActivation } from "@/server/features/dashboard/services/DashboardService";
import type { DashboardSetupStep } from "@/types/schemas/dashboard";

export const setupSteps: {
  id: DashboardSetupStep;
  label: string;
  detail: string;
  icon: typeof Globe;
  skipLabel: string;
}[] = [
  {
    id: "competitor",
    label: "Explore a competitor",
    detail: "Find topics and links worth learning from.",
    icon: Globe,
    skipLabel: "Skip for now",
  },
  {
    id: "keywords",
    label: "Get keyword ideas",
    detail: "Start from one keyword and see what people search for.",
    icon: Lightbulb,
    skipLabel: "Skip for now",
  },
  {
    id: "audit",
    label: "Audit your site",
    detail: "Crawl for broken links, missing tags, and indexability problems.",
    icon: ClipboardCheck,
    skipLabel: "Skip for now",
  },
  {
    id: "mcp",
    label: "Connect your AI agent",
    detail: "Use OpenSEO inside Claude or your favorite agent.",
    icon: Bot,
    skipLabel: "Skip for now",
  },
  {
    id: "team",
    label: "Invite a teammate",
    detail: "Share the work, or keep things solo for now.",
    icon: Users,
    skipLabel: "Skip",
  },
  {
    id: "project",
    label: "Working on multiple websites?",
    detail:
      "Create another project, or let your AI agent set up a list of sites.",
    icon: FolderPlus,
    skipLabel: "I only need one project",
  },
];

export function getStepStatus(
  activation: DashboardActivation,
  step: DashboardSetupStep,
): "done" | "skipped" | "todo" {
  const completed: Record<DashboardSetupStep, boolean> = {
    competitor: activation.competitorResearchedAt !== null,
    keywords: activation.keywordsResearchedAt !== null,
    audit: activation.hasAudit,
    mcp:
      activation.mcp.authorizedAt !== null ||
      activation.mcp.firstToolCallAt !== null,
    team: activation.hasTeammate,
    project: activation.hasMultipleProjects,
  };
  if (completed[step]) return "done";
  if (!activation.dismissedSteps.includes(step)) return "todo";
  return completeWhenSkipped.has(step) ? "done" : "skipped";
}

// Skipping these marks them complete, so they never wait in "saved for later".
const completeWhenSkipped = new Set<DashboardSetupStep>(["team", "project"]);
