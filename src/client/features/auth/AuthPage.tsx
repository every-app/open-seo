import { z } from "zod";
import { normalizeAuthRedirect } from "@/lib/auth-redirect";
import { useSession } from "@/lib/auth-client";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import {
  getFieldError as getSharedFieldError,
  getFormError as getSharedFormError,
} from "@/client/lib/forms";

export const authRedirectSearchSchema = z.object({
  redirect: z.string().optional(),
});

export function useAuthPageState(redirect: string | undefined) {
  const redirectTo = normalizeAuthRedirect(redirect);
  const { isPending: isSessionPending } = useSession();
  const isHostedMode = isHostedClientAuthMode();

  return {
    redirectTo,
    isHostedMode,
    isSessionPending,
  };
}

export function getFieldError(errors: readonly unknown[]) {
  return getSharedFieldError(errors);
}

export function getFormError(error: unknown) {
  return getSharedFormError(error);
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

export function AuthPageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-base-200">
      <div className="min-h-[100dvh] flex items-center justify-center p-4">
        {children}
      </div>
    </div>
  );
}
