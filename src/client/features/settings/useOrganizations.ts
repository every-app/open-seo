import { useQuery } from "@tanstack/react-query";
import { organizationContextQueryOptions } from "@/client/features/team/organizationQueries";

// Which organization an agent or key is bound to only matters to people in
// more than one; everyone else sees no organization labels at all, the same
// rule as the sidebar switcher.
export function useOrganizations() {
  const { data } = useQuery(organizationContextQueryOptions());
  const organizations = data?.organizations ?? [];
  return {
    activeOrganizationName: data?.organizationName ?? null,
    hasMultiple: organizations.length > 1,
    organizationName: (organizationId: string | null) =>
      organizations.find((o) => o.organizationId === organizationId)
        ?.organizationName ?? null,
  };
}
