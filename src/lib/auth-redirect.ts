export function normalizeAuthRedirect(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  return value;
}

export function getCurrentAuthRedirect(location: {
  pathname: string;
  search: string;
  hash?: string;
}) {
  return normalizeAuthRedirect(
    `${location.pathname}${location.search}${location.hash ?? ""}`,
  );
}
