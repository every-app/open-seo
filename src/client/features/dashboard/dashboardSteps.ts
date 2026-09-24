import { Bot, FolderPlus, Globe, Search, Users } from "lucide-react";
import type { DashboardActivation } from "@/server/features/dashboard/services/DashboardService";
import type { DashboardSetupStep } from "@/types/schemas/dashboard";
import { brand } from "@/shared/brand";

export const setupSteps: {
  id: DashboardSetupStep;
  label: string;
  detail: string;
  icon: typeof Globe;
}[] = [
  {
    id: "domain",
    label: "Add your website",
    detail: "Set the website and country for this project.",
    icon: Globe,
  },
  {
    id: "project",
    label: "Working on multiple websites?",
    detail:
      "Create another project, or let your AI agent set up a list of sites.",
    icon: FolderPlus,
  },
  {
    id: "competitor",
    label: "Explore a competitor",
    detail: "Find topics and links worth learning from.",
    icon: Search,
  },
  {
    id: "mcp",
    label: "Connect your AI agent",
    detail: `Use ${brand.name} inside Claude or your favorite agent.`,
    icon: Bot,
  },
  {
    id: "gsc",
    label: "Connect Search Console",
    detail: "Bring your real clicks and queries into view.",
    icon: Search,
  },
  {
    id: "team",
    label: "Invite a teammate",
    detail: "Share the work, or keep things solo for now.",
    icon: Users,
  },
];

export function getStepStatus(
  activation: DashboardActivation,
  step: DashboardSetupStep,
): "done" | "skipped" | "todo" {
  const completed: Record<DashboardSetupStep, boolean> = {
    domain: activation.domain !== null,
    project: activation.hasMultipleProjects,
    competitor: activation.competitorClickedAt !== null,
    mcp:
      activation.mcp.authorizedAt !== null ||
      activation.mcp.firstToolCallAt !== null,
    gsc: activation.gsc.connected,
    team: activation.hasTeammate,
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
