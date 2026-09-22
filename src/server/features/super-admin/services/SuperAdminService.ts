import { SuperAdminRepository } from "../repositories/SuperAdminRepository";

async function getOverview() {
  const clients = await SuperAdminRepository.listClients();
  return {
    clients,
    totals: clients.reduce(
      (result, client) => ({
        clients: result.clients + 1,
        members: result.members + client.memberCount,
        projects: result.projects + client.projectCount,
        pendingInvitations:
          result.pendingInvitations + client.pendingInvitationCount,
      }),
      { clients: 0, members: 0, projects: 0, pendingInvitations: 0 },
    ),
  };
}

export const SuperAdminService = { getOverview };
