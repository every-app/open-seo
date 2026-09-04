import { AgentMarketplaceRepository } from "@/server/features/agent-marketplaces/repositories/AgentMarketplaceRepository";
import {
  AGENT_MARKETPLACE_PLATFORMS,
  type AddAgentMarketplaceEvidenceInput,
  type AgentMarketplacePlatform,
  type UpdateAgentMarketplaceInput,
} from "@/types/schemas/agent-marketplaces";

const PLATFORM_LABELS: Record<AgentMarketplacePlatform, string> = {
  openai: "OpenAI",
  claude: "Claude hosted marketplace",
  claude_community: "Claude community directory",
  grok: "Grok",
  cursor: "Cursor",
  mcp_directory: "MCP Directory",
  skills_sh: "skills.sh",
};

async function list(projectId: string) {
  const listings = await AgentMarketplaceRepository.listForProject(projectId);
  const evidence = await AgentMarketplaceRepository.listLatestEvidence(
    listings.map((listing) => listing.id),
  );
  const listingByPlatform = new Map(
    listings.map((listing) => [listing.platform, listing]),
  );
  const latestEvidenceByListing = new Map<string, (typeof evidence)[number]>();
  for (const snapshot of evidence) {
    if (!latestEvidenceByListing.has(snapshot.listingId)) {
      latestEvidenceByListing.set(snapshot.listingId, snapshot);
    }
  }

  return AGENT_MARKETPLACE_PLATFORMS.map((platform) => {
    const listing = listingByPlatform.get(platform) ?? null;
    return {
      platform,
      label: PLATFORM_LABELS[platform],
      listing,
      latestEvidence: listing
        ? (latestEvidenceByListing.get(listing.id) ?? null)
        : null,
    };
  });
}

async function update(input: UpdateAgentMarketplaceInput) {
  return AgentMarketplaceRepository.upsert(input);
}

async function addEvidence(input: AddAgentMarketplaceEvidenceInput) {
  let listing = await AgentMarketplaceRepository.getByPlatform(
    input.projectId,
    input.platform,
  );
  if (!listing) {
    listing = await AgentMarketplaceRepository.upsert({
      projectId: input.projectId,
      platform: input.platform,
      status: "not_started",
    });
  }
  return AgentMarketplaceRepository.addEvidence(listing.id, input);
}

export const AgentMarketplaceService = { addEvidence, list, update };
