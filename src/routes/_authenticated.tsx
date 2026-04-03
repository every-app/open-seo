import { Outlet, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AuthPageShell } from "@/client/features/auth/AuthPage";
import { useSession } from "@/lib/auth-client";
import { isHostedClientAuthMode } from "@/lib/auth-mode";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedShellLayout,
});

function AuthenticatedShellLayout() {
  const navigate = useNavigate();
  const { data: session, isPending } = useSession();
  const isHostedMode = isHostedClientAuthMode();

  useEffect(() => {
    if (isPending || !isHostedMode) return;
    if (!session?.user?.id) {
      void navigate({
        to: "/sign-in",
        search: { redirect: window.location.pathname },
      });
    }
  }, [isPending, isHostedMode, session?.user?.id, navigate]);

  if (!isHostedMode || isPending || !session?.user?.id) {
    return null;
  }

  return (
    <AuthPageShell>
      <Outlet />
    </AuthPageShell>
  );
}
