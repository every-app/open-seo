import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { getAuthMode } from "@/lib/auth-mode";
import {
  demoCredentialsSchema,
  getLocalDemoAccountBySession,
  LOCAL_DEMO_ACCOUNTS,
  LOCAL_DEMO_COOKIE,
} from "@/shared/demo-auth";

function unavailable() {
  return new Response("Not found", { status: 404 });
}

function isDemoAuthEnabled() {
  return (
    getAuthMode(env.AUTH_MODE) === "local_noauth" &&
    env.VITE_DGTL_DEMO_AUTH === "true"
  );
}

function readCookie(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  const value = cookie
    .split(";")
    .map((part) => part.trim().split("="))
    .find(([name]) => name === LOCAL_DEMO_COOKIE)?.[1];
  return value ? decodeURIComponent(value) : undefined;
}

function cookieHeader(value: string, maxAge: number) {
  return `${LOCAL_DEMO_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

async function getDemoSession(request: Request) {
  if (!isDemoAuthEnabled()) return unavailable();
  const account = getLocalDemoAccountBySession(readCookie(request));
  return Response.json(
    account
      ? { authenticated: true, email: account.email, role: account.role }
      : { authenticated: false, email: null, role: null },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

async function createDemoSession(request: Request) {
  if (!isDemoAuthEnabled()) return unavailable();
  const result = demoCredentialsSchema.safeParse(
    await request.json().catch(() => null),
  );
  const email = result.success ? result.data.email.trim() : "";
  const password = result.success ? result.data.password : "";
  const account = Object.values(LOCAL_DEMO_ACCOUNTS).find(
    (candidate) =>
      candidate.email.toLowerCase() === email.toLowerCase() &&
      candidate.password === password,
  );
  if (!account) {
    return Response.json(
      { error: "The demo email or password is incorrect." },
      { status: 401 },
    );
  }
  return Response.json(
    { authenticated: true, email: account.email, role: account.role },
    {
      headers: {
        "Cache-Control": "private, no-store",
        "Set-Cookie": cookieHeader(account.session, 60 * 60 * 8),
      },
    },
  );
}

function deleteDemoSession() {
  if (!isDemoAuthEnabled()) return unavailable();
  return new Response(null, {
    status: 204,
    headers: { "Set-Cookie": cookieHeader("", 0) },
  });
}

export const Route = createFileRoute("/api/demo-auth")({
  server: {
    handlers: {
      GET: ({ request }) => getDemoSession(request),
      POST: ({ request }) => createDemoSession(request),
      DELETE: () => deleteDemoSession(),
    },
  },
});
