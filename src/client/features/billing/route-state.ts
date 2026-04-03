export function getBillingRouteState(args: {
  hasSession: boolean;
  isSessionPending: boolean;
  isCustomerLoading: boolean;
  isCustomerError: boolean;
  hasManagedServiceAccess: boolean;
}) {
  if (args.isSessionPending || !args.hasSession || args.isCustomerLoading) {
    return "loading" as const;
  }

  if (args.isCustomerError) {
    return "error" as const;
  }

  if (!args.hasManagedServiceAccess) {
    return "redirectToSubscribe" as const;
  }

  return "ready" as const;
}

export function getSubscribeRouteState(args: {
  hasSession: boolean;
  isCustomerLoading: boolean;
  isCustomerError: boolean;
  hasManagedServiceAccess: boolean;
}) {
  if (!args.hasSession || args.isCustomerLoading) {
    return "loading" as const;
  }

  if (args.isCustomerError) {
    return "error" as const;
  }

  if (args.hasManagedServiceAccess) {
    return "redirectToApp" as const;
  }

  return "ready" as const;
}
