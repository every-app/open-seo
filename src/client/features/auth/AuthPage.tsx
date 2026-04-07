import { z } from "zod";
import { normalizeAuthRedirect } from "@/lib/auth-redirect";
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
  const isHostedMode = isHostedClientAuthMode();

  return {
    redirectTo,
    isHostedMode,
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
  helperText?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="w-full max-w-xs space-y-6">
      <div className="text-center space-y-3">
        <img
          src="/transparent-logo.png"
          alt="OpenSEO"
          className="mx-auto size-10 rounded-lg"
        />
        <div>
          <h1 className="text-xl font-semibold">{title}</h1>
          {helperText ? (
            <p className="text-sm text-base-content/60 mt-1">{helperText}</p>
          ) : null}
        </div>
      </div>

      {children}

      {footer ? <div className="text-center">{footer}</div> : null}
    </div>
  );
}

export function AuthPageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center p-4 bg-base-200">
      {children}
    </div>
  );
}
