import { z } from "zod";
import { normalizeAuthRedirect } from "@/lib/auth-redirect";
import { useSession } from "@/lib/auth-client";
import { isHostedClientAuthMode } from "@/lib/auth-mode";

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

export function getFieldError(errors: unknown[]) {
  const first = errors[0];
  if (typeof first === "string") return first;
  if (first && typeof first === "object" && "message" in first)
    return String((first as { message: unknown }).message);
  return null;
}

export function getFormError(error: unknown): string | null {
  if (!error) return null;
  if (typeof error === "string") return error;
  if (typeof error === "object" && "form" in error)
    return String((error as { form: unknown }).form);
  return null;
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
