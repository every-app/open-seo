import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { demoSessionSchema } from "@/shared/demo-auth";

const signedOutDemoSession = {
  authenticated: false,
  email: null,
  role: null,
} as const;

const demoAuthErrorSchema = z.object({ error: z.string() });

export function isLocalDemoAuthEnabled() {
  return (
    !isHostedClientAuthMode() && import.meta.env.VITE_DGTL_DEMO_AUTH === "true"
  );
}

async function getDemoSession() {
  const response = await fetch("/api/demo-auth", {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return signedOutDemoSession;

  const result = demoSessionSchema.safeParse(await response.json());
  return result.success ? result.data : signedOutDemoSession;
}

export function useDemoSession(enabled = isLocalDemoAuthEnabled()) {
  return useQuery({
    queryKey: ["demo-auth", "session"],
    queryFn: getDemoSession,
    enabled,
    retry: false,
  });
}

export async function signOutDemoSession() {
  await fetch("/api/demo-auth", {
    method: "DELETE",
    credentials: "same-origin",
  });
  window.location.assign("/");
}

export async function signInDemoSession(credentials: {
  email: string;
  password: string;
}) {
  const response = await fetch("/api/demo-auth", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });
  if (response.ok) return { ok: true } as const;

  const result = demoAuthErrorSchema.safeParse(
    await response.json().catch(() => null),
  );
  return {
    ok: false,
    error: result.success ? result.data.error : "We couldn't sign you in.",
  } as const;
}
