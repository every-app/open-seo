import type { PlanStatus } from "@/client/features/billing/plan-detection";

export function getBillingRouteState(args: {
  hasSession: boolean;
  isSessionPending: boolean;
  isCustomerLoading: boolean;
  isCustomerError: boolean;
}) {
  if (args.isSessionPending || !args.hasSession || args.isCustomerLoading) {
    return "loading" as const;
  }

  if (args.isCustomerError) {
    return "error" as const;
  }

  return "ready" as const;
}

export function getSubscribeRouteState(args: {
  hasSession: boolean;
  isCustomerLoading: boolean;
  isCustomerError: boolean;
  planStatus: PlanStatus;
}) {
  if (!args.hasSession || args.isCustomerLoading) {
    return "loading" as const;
  }

  if (args.isCustomerError) {
    return "error" as const;
  }

  if (args.planStatus === "paid") {
    return "redirectToApp" as const;
  }

  return "showWelcome" as const;
}
