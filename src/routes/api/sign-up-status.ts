import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { getAuthMode } from "@/lib/auth-mode";

// Unauthenticated: tells the sign-in and sign-up pages whether this standalone
// installation still has no account, so its first visitor can create the
// administrator's. Every other mode answers false without a database read.
async function handleSignUpStatusRequest(): Promise<Response> {
  let firstAccount = false;
  if (getAuthMode(env.AUTH_MODE) === "password") {
    const { isFirstAccountOpen } = await import("@/server/standalone/sign-up");
    firstAccount = await isFirstAccountOpen();
  }
  return Response.json(
    { firstAccount },
    { headers: { "cache-control": "no-store" } },
  );
}

export const Route = createFileRoute("/api/sign-up-status")({
  server: {
    handlers: {
      GET: () => handleSignUpStatusRequest(),
    },
  },
});
