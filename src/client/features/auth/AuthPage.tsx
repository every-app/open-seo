import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { normalizeAuthRedirect } from "@/lib/auth-redirect";
import { useSession } from "@/lib/auth-client";
import { isHostedClientAuthMode } from "@/lib/auth-mode";

export const authRedirectSearchSchema = z.object({
  redirect: z.string().optional(),
});

export function useAuthPageState(redirect: string | undefined) {
  const navigate = useNavigate();
  const redirectTo = normalizeAuthRedirect(redirect);
  const { data: session, isPending: isSessionPending } = useSession();
  const isHostedMode = isHostedClientAuthMode();

  useEffect(() => {
    if (!session?.user?.id) {
      return;
    }

    void navigate({ href: redirectTo });
  }, [navigate, redirectTo, session?.user?.id]);

  return {
    redirectTo,
    isHostedMode,
    isSessionPending,
  };
}

export function getAuthLinkSearch(redirectTo: string) {
  return redirectTo === "/" ? {} : { redirect: redirectTo };
}

export function getFieldError(errors: unknown[]) {
  return typeof errors[0] === "string" ? errors[0] : null;
}

export function AuthPageCard({
  title,
  helperText,
  children,
  footer,
}: {
  title: string;
  helperText: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="card w-full max-w-md bg-base-100 shadow-xl border border-base-300">
      <div className="card-body gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-sm text-base-content/70 mt-1">{helperText}</p>
        </div>

        {children}

        {footer}
      </div>
    </div>
  );
}
