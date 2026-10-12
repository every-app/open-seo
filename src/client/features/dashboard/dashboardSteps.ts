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
}[] = [
  {
    id: "competitor",
    label: "Explore a competitor",
    detail: "Find topics and links worth learning from.",
    icon: Globe,
  },
  {
    id: "keywords",
    label: "Get keyword ideas",
    detail: "Start from one keyword and see what people search for.",
    icon: Lightbulb,
  },
  {
    id: "audit",
    label: "Audit your site",
    detail: "Crawl for broken links, missing tags, and indexability problems.",
    icon: ClipboardCheck,
  },
  {
    id: "mcp",
    label: "Connect your AI agent",
    detail: "Use OpenSEO inside Claude or your favorite agent.",
    icon: Bot,
  },
  {
    id: "team",
    label: "Invite a teammate",
    detail: "Share the work, or keep things solo for now.",
    icon: Users,
  },
  {
    id: "project",
    label: "Working on multiple websites?",
    detail:
      "Create another project, or let your AI agent set up a list of sites.",
    icon: FolderPlus,
  },
];

export function getStepStatus(
  activation: DashboardActivation,
  step: DashboardSetupStep,
): "done" | "skipped" | "todo" {
  const completed: Record<DashboardSetupStep, boolean> = {
    competitor: activation.competitorClickedAt !== null,
    keywords: activation.keywordsClickedAt !== null,
    audit: activation.hasAudit,
    mcp:
      activation.mcp.authorizedAt !== null ||
      activation.mcp.firstToolCallAt !== null,
    team: activation.hasTeammate,
    project: activation.hasMultipleProjects,
  };
  if (completed[step]) return "done";
  // Preserve previous MCP dismissals without treating them as authorization.
  if (
    activation.dismissedSteps.includes(step) ||
    (step === "mcp" && activation.mcp.cardDismissedAt !== null)
  )
    return "skipped";
  return "todo";
}
