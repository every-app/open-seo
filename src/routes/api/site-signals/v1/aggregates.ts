import { createFileRoute } from "@tanstack/react-router";
import { handleFirstPartyAggregateRequest } from "@/server/features/first-party-signals/handleAggregateRequest";

export const Route = createFileRoute("/api/site-signals/v1/aggregates")({
  server: {
    handlers: {
      POST: ({ request }: { request: Request }) =>
        handleFirstPartyAggregateRequest(request),
    },
  },
});
