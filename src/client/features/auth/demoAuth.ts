import { useQuery } from "@tanstack/react-query";
import { isHostedClientAuthMode } from "@/lib/auth-mode";

export type DemoSession = {
  authenticated: boolean;
  email: string | null;
  role: "super_admin" | "client" | null;
};

export function isLocalDemoAuthEnabled() {
  return (
    !isHostedClientAuthMode() &&
    import.meta.env.VITE_DGTL_DEMO_AUTH === "true"
  );
}

export async function getDemoSession(): Promise<DemoSession> {
  const response = await fetch("/api/demo-auth", {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return { authenticated: false, email: null, role: null };
  return response.json() as Promise<DemoSession>;
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
  await fetch("/api/demo-auth", { method: "DELETE", credentials: "same-origin" });
  window.location.assign("/");
}
