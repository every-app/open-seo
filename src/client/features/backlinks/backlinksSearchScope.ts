import type { BacklinksTargetScope } from "@/types/schemas/backlinks";

export function inferBacklinksSearchScopeFromTarget(
  target: string,
): BacklinksTargetScope {
  const trimmed = target.trim();
  if (!trimmed) {
    return "domain";
  }

  const hasExplicitProtocol = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed);

  try {
    const parsed = new URL(
      hasExplicitProtocol ? trimmed : `https://${trimmed}`,
    );
    return hasExplicitProtocol || parsed.pathname !== "/" ? "page" : "domain";
  } catch {
    return "domain";
  }
}

export function resolveBacklinksSearchScope({
  target,
  selectedScope,
  userSelectedScope,
}: {
  target: string;
  selectedScope: BacklinksTargetScope;
  userSelectedScope: boolean;
}): BacklinksTargetScope {
  if (userSelectedScope) {
    return selectedScope;
  }

  return inferBacklinksSearchScopeFromTarget(target);
}

export function getPersistedBacklinksSearchScope(
  target: string,
  scope: BacklinksTargetScope,
): BacklinksTargetScope | undefined {
  return scope === inferBacklinksSearchScopeFromTarget(target)
    ? undefined
    : scope;
}
