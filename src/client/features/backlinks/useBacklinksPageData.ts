import { useEffect, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  BacklinksPageProps,
  BacklinksSearchState,
} from "./backlinksPageTypes";
import {
  getErrorCode,
  getStandardErrorMessage,
} from "@/client/lib/error-messages";
import {
  getBacklinksOverview,
  getBacklinksReferringDomains,
  getBacklinksTopPages,
} from "@/serverFunctions/backlinks";
import {
  getBacklinksAccessSetupStatus,
  testBacklinksAccess,
} from "@/serverFunctions/backlinksAccess";
import { getPersistedBacklinksSearchScope } from "./backlinksSearchScope";

type UseBacklinksPageDataArgs = {
  projectId: string;
  searchState: BacklinksSearchState;
};

function getBacklinksErrorMessage(
  error: unknown,
  fallback: string,
): string | null {
  if (!error) return null;
  if (getErrorCode(error) === "VALIDATION_ERROR") {
    return "Enter a valid domain or page URL.";
  }

  return getStandardErrorMessage(error, fallback);
}

export function useBacklinksPageData({
  projectId,
  searchState,
}: UseBacklinksPageDataArgs) {
  const accessStatusQuery = useQuery({
    queryKey: ["backlinksAccessStatus", projectId],
    queryFn: () => getBacklinksAccessSetupStatus({ data: { projectId } }),
  });
  const accessStatus = accessStatusQuery.data;
  const accessStatusErrorMessage = accessStatusQuery.error
    ? getStandardErrorMessage(
        accessStatusQuery.error,
        "Could not load Backlinks setup status.",
      )
    : null;
  const backlinksEnabled = accessStatus?.enabled ?? false;
  const requestInput = buildBacklinksRequestInput(projectId, searchState);
  const searchCardInitialValues = useMemo(
    () => ({
      target: searchState.target,
      scope: searchState.scope,
    }),
    [searchState.scope, searchState.target],
  );

  const testAccessMutation = useMutation({
    mutationFn: () => testBacklinksAccess({ data: { projectId } }),
    onSuccess: async () => {
      await accessStatusQuery.refetch();
    },
  });

  const baseQueryKeyParts = [
    projectId,
    searchState.scope,
    searchState.target,
  ] as const;
  const overviewQuery = useQuery({
    queryKey: ["backlinksOverview", ...baseQueryKeyParts],
    enabled: backlinksEnabled && Boolean(searchState.target),
    queryFn: () => getBacklinksOverview({ data: requestInput }),
  });

  const referringDomainsQuery = useQuery({
    queryKey: ["backlinksReferringDomains", ...baseQueryKeyParts],
    enabled:
      backlinksEnabled &&
      Boolean(searchState.target) &&
      searchState.tab === "domains",
    queryFn: () => getBacklinksReferringDomains({ data: requestInput }),
  });

  const topPagesQuery = useQuery({
    queryKey: ["backlinksTopPages", ...baseQueryKeyParts],
    enabled:
      backlinksEnabled &&
      Boolean(searchState.target) &&
      searchState.tab === "pages",
    queryFn: () => getBacklinksTopPages({ data: requestInput }),
  });

  const overviewErrorMessage = getBacklinksErrorMessage(
    overviewQuery.error,
    "Could not load backlinks data.",
  );
  const backlinksDisabledByError =
    getErrorCode(overviewQuery.error) === "BACKLINKS_NOT_ENABLED";
  const activeTabError = getActiveTabError(
    searchState,
    referringDomainsQuery.error,
    topPagesQuery.error,
  );
  const activeTabErrorMessage = getBacklinksErrorMessage(
    activeTabError,
    "Could not load this tab.",
  );
  const backlinksDisabledByTabError =
    getErrorCode(activeTabError) === "BACKLINKS_NOT_ENABLED";

  useEffect(() => {
    if (
      (backlinksDisabledByError || backlinksDisabledByTabError) &&
      accessStatus?.enabled
    ) {
      void accessStatusQuery.refetch();
    }
  }, [
    accessStatus?.enabled,
    accessStatusQuery,
    backlinksDisabledByError,
    backlinksDisabledByTabError,
  ]);

  return {
    accessStatus,
    accessStatusErrorMessage,
    accessStatusQuery,
    activeTabErrorMessage,
    backlinksDisabledByError,
    backlinksEnabled,
    overviewErrorMessage,
    overviewQuery,
    referringDomainsQuery,
    searchCardInitialValues,
    testAccessMutation,
    topPagesQuery,
  };
}

export function navigateToBacklinksSearch(
  navigate: BacklinksPageProps["navigate"],
  values: Pick<BacklinksSearchState, "target" | "scope">,
) {
  navigate({
    search: (prev) => ({
      ...prev,
      target: values.target,
      scope: getPersistedBacklinksSearchScope(values.target, values.scope),
      tab: undefined,
    }),
    replace: true,
  });
}

export function navigateToBacklinksHistory(
  navigate: BacklinksPageProps["navigate"],
) {
  navigate({
    search: (prev) => ({
      ...prev,
      target: undefined,
      scope: undefined,
      tab: undefined,
    }),
    replace: true,
  });
}

export function navigateToBacklinksTab(
  navigate: BacklinksPageProps["navigate"],
  tab: BacklinksSearchState["tab"],
) {
  navigate({
    search: (prev) => ({
      ...prev,
      tab: tab === "backlinks" ? undefined : tab,
    }),
    replace: true,
  });
}

function buildBacklinksRequestInput(
  projectId: string,
  searchState: BacklinksSearchState,
) {
  return {
    projectId,
    target: searchState.target,
    scope: searchState.scope,
  };
}

function getActiveTabError(
  searchState: BacklinksSearchState,
  referringDomainsError: unknown,
  topPagesError: unknown,
) {
  if (searchState.tab === "domains") {
    return referringDomainsError;
  }

  if (searchState.tab === "pages") {
    return topPagesError;
  }

  return null;
}
