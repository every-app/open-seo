import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { z } from "zod";
import { Button } from "@/client/components/ui/button";
import {
  getCurrentAuthRedirect,
  getOAuthSignedQuery,
} from "@/lib/auth-redirect";
import { isHostedClientAuthMode, usesBetterAuthClient } from "@/lib/auth-mode";
import { PRIVACY_URL, TERMS_URL } from "@/shared/terms";
import { signUpStatusQueryOptions } from "./signUpStatus";
import type { useSocialAuth } from "./useSocialAuth";

// Public OpenAI client ID for Sign in with ChatGPT, inlined at build time (see
// vite.config envPrefix). The button renders only when it is set and the
// server says to offer it (its runtime client ID, and in production the
// feature flag).
const CHATGPT_CLIENT_ID = import.meta.env.OPENAI_SIWC_CLIENT_ID?.trim();

export const authRedirectSearchSchema = z.object({
  redirect: z.string().optional(),
});

// The auth forms keep their pre-shadcn look: white inputs with 16px text, and a
// soft grey submit button.
export const authInputClassName =
  "border-foreground/20 bg-card text-base md:text-base";
export const authSubmitClassName =
  "w-full border-border bg-[color-mix(in_oklab,var(--card),var(--foreground)_8%)] font-semibold hover:bg-[color-mix(in_oklab,var(--card),var(--foreground)_12%)]";

export function useAuthPageState(redirect: string | undefined) {
  const redirectTo = getCurrentAuthRedirect(redirect);
  const oauthQuery =
    typeof window !== "undefined"
      ? getOAuthSignedQuery(window.location.search)
      : null;
  const isHostedMode = isHostedClientAuthMode();
  // Better Auth accounts exist (hosted or the standalone Docker edition), so
  // the email/password form can sign someone in.
  const isBetterAuthMode = usesBetterAuthClient();
  const chatGptConfigured = isHostedMode && Boolean(CHATGPT_CLIENT_ID);
  const signUpStatus = useQuery({
    ...signUpStatusQueryOptions(),
    enabled: chatGptConfigured,
  });
  const chatGptEnabled =
    chatGptConfigured && signUpStatus.data?.chatGptSignIn === true;

  return {
    chatGptEnabled,
    redirectTo,
    oauthQuery,
    isHostedMode,
    isBetterAuthMode,
  };
}

const termsLinkClassName =
  "text-foreground underline underline-offset-2 hover:text-foreground/80 transition-colors";

// Clickwrap: shown next to every button that can create an account, so
// clicking it is the affirmative acceptance the signup hook records.
export function TermsAgreementNotice({ action }: { action: string }) {
  return (
    <p className="text-center text-sm leading-relaxed text-muted-foreground">
      {action}, you agree to our{" "}
      <a
        href={TERMS_URL}
        target="_blank"
        rel="noreferrer"
        className={termsLinkClassName}
      >
        Terms
      </a>{" "}
      and{" "}
      <a
        href={PRIVACY_URL}
        target="_blank"
        rel="noreferrer"
        className={termsLinkClassName}
      >
        Privacy Policy
      </a>
      .
    </p>
  );
}

type SocialAuth = ReturnType<typeof useSocialAuth>;

export function AuthMethodChooser({
  googleLabel,
  emailLabel = "Continue with email",
  disabled,
  google,
  chatGpt,
  onContinueWithEmail,
}: {
  googleLabel: string;
  emailLabel?: string;
  disabled?: boolean;
  google: SocialAuth;
  /** Set where Sign in with ChatGPT is configured; otherwise no button. */
  chatGpt?: SocialAuth;
  onContinueWithEmail: () => void;
}) {
  const anyBusy = google.isStarting || chatGpt?.isStarting;
  // Google's button is white and ChatGPT's black in both themes, so the two
  // read as different providers at a glance. Both are formats their owners
  // approve.
  const googleButtonClassName =
    "w-full border-black/10 !bg-white font-semibold !text-neutral-900 hover:border-black/20 hover:!bg-neutral-50";
  const chatGptButtonClassName =
    "w-full border-black !bg-black font-semibold !text-white hover:!bg-neutral-800 dark:border-white/25 dark:hover:border-white/40 dark:hover:!bg-neutral-900";
  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="outline"
        className={googleButtonClassName}
        onClick={() => {
          chatGpt?.clearError();
          void google.start();
        }}
        disabled={disabled || anyBusy}
      >
        <GoogleLogo />
        {google.isStarting ? "Opening Google..." : googleLabel}
      </Button>

      {chatGpt ? (
        <Button
          type="button"
          variant="outline"
          className={chatGptButtonClassName}
          onClick={() => {
            google.clearError();
            void chatGpt.start();
          }}
          disabled={disabled || anyBusy}
          // OpenAI asks for these on every Sign in with ChatGPT button, to
          // verify the integration and troubleshoot sign-in.
          data-oai-siwc-button=""
          data-oai-siwc-button-client={CHATGPT_CLIENT_ID}
        >
          <ChatGptLogo />
          {chatGpt.isStarting ? "Opening ChatGPT..." : "Continue with ChatGPT"}
        </Button>
      ) : null}

      <div
        role="separator"
        className="flex items-center gap-3 py-1 text-xs text-muted-foreground"
      >
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full bg-card font-semibold dark:border-border dark:bg-card"
        onClick={onContinueWithEmail}
        disabled={disabled || anyBusy}
      >
        {emailLabel}
      </Button>
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 18" className="size-4 shrink-0">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.33-1.58-5.04-3.72H.94v2.34A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.96 10.7A5.4 5.4 0 0 1 3.68 9c0-.59.1-1.16.28-1.7V4.96H.94A9 9 0 0 0 0 9c0 1.45.34 2.82.94 4.04l3.02-2.34Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A8.64 8.64 0 0 0 9 0 9 9 0 0 0 .94 4.96L3.96 7.3C4.67 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

// OpenAI's official mark for Sign in with ChatGPT buttons
// (developers.openai.com/assets/siwc/sign-in-buttons). Its artwork has its own
// margin, so it is drawn larger than the Google logo to look the same size.
function ChatGptLogo() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 21 21"
      fill="currentColor"
      className="size-5 shrink-0"
    >
      <path d="M11.8102 19.1625C11.2327 19.1625 10.6841 19.0528 10.1643 18.8334C9.64459 18.6139 9.18259 18.3078 8.77834 17.9151C8.33944 18.0653 7.88322 18.1404 7.40967 18.1404C6.63582 18.1404 5.91972 17.9498 5.26137 17.5686C4.60302 17.1875 4.07172 16.6677 3.66747 16.0094C3.27477 15.351 3.07842 14.6176 3.07842 13.8091C3.07842 13.4742 3.12462 13.1103 3.21702 12.7176C2.75502 12.2903 2.39697 11.7994 2.14287 11.245C1.88877 10.679 1.76172 10.09 1.76172 9.47785C1.76172 8.85415 1.89454 8.25355 2.16019 7.67605C2.42584 7.09855 2.79544 6.6019 3.26899 6.1861C3.75409 5.75875 4.31427 5.46422 4.94952 5.30252C5.07657 4.64417 5.34222 4.05512 5.74647 3.53537C6.16227 3.00407 6.67047 2.58827 7.27107 2.28797C7.87167 1.98767 8.51269 1.83752 9.19414 1.83752C9.77164 1.83752 10.3203 1.94725 10.84 2.1667C11.3598 2.38615 11.8218 2.69222 12.226 3.08492C12.6649 2.93477 13.1211 2.8597 13.5947 2.8597C14.3685 2.8597 15.0846 3.05027 15.743 3.43142C16.4013 3.81257 16.9269 4.33232 17.3196 4.99067C17.7238 5.64902 17.9259 6.38245 17.9259 7.19095C17.9259 7.5259 17.8797 7.88973 17.7873 8.28242C18.2493 8.70977 18.6074 9.20643 18.8615 9.77238C19.1156 10.3268 19.2426 10.91 19.2426 11.5222C19.2426 12.1459 19.1098 12.7465 18.8442 13.324C18.5785 13.9015 18.2031 14.4039 17.718 14.8313C17.2445 15.2471 16.6901 15.5358 16.0548 15.6975C15.9278 16.3559 15.6564 16.9449 15.2406 17.4647C14.8363 17.996 14.3339 18.4118 13.7333 18.7121C13.1327 19.0124 12.4917 19.1625 11.8102 19.1625ZM7.53094 16.9969C8.10844 16.9969 8.61087 16.8756 9.03822 16.6331L12.2953 14.762C12.4108 14.6811 12.4686 14.5714 12.4686 14.4328V12.9429L8.27592 15.351C8.02182 15.5012 7.76772 15.5012 7.51362 15.351L4.23919 13.4626C4.23919 13.4973 4.23342 13.5377 4.22187 13.5839C4.22187 13.6301 4.22187 13.6994 4.22187 13.7918C4.22187 14.3808 4.36047 14.9237 4.63767 15.4203C4.92642 15.9054 5.32489 16.2866 5.83309 16.5638C6.34129 16.8525 6.90724 16.9969 7.53094 16.9969ZM7.70419 14.1729C7.77349 14.2076 7.83702 14.2249 7.89477 14.2249C7.95252 14.2249 8.01027 14.2076 8.06802 14.1729L9.36739 13.4279L5.19207 11.0024C4.93797 10.8523 4.81092 10.6271 4.81092 10.3268V6.56725C4.23342 6.82135 3.77142 7.21405 3.42492 7.74535C3.07842 8.2651 2.90517 8.8426 2.90517 9.47785C2.90517 10.0438 3.04954 10.5866 3.33829 11.1064C3.62704 11.6261 4.00242 12.0189 4.46442 12.2845L7.70419 14.1729ZM11.8102 18.0191C12.4224 18.0191 12.9768 17.8805 13.4734 17.6033C13.9701 17.3261 14.3628 16.9449 14.6515 16.4598C14.9403 15.9747 15.0846 15.4319 15.0846 14.8313V11.0891C15.0846 10.9505 15.0269 10.8465 14.9114 10.7772L13.5947 10.0149V14.8486C13.5947 15.1489 13.4676 15.3741 13.2135 15.5243L9.93912 17.4127C10.5051 17.817 11.1288 18.0191 11.8102 18.0191ZM12.4686 11.6781V9.32192L10.5108 8.21312L8.53579 9.32192V11.6781L10.5108 12.7869L12.4686 11.6781ZM7.40967 6.15145C7.40967 5.85115 7.53672 5.62592 7.79082 5.47577L11.0652 3.58735C10.4993 3.1831 9.87559 2.98097 9.19414 2.98097C8.58199 2.98097 8.02759 3.11957 7.53094 3.39677C7.03429 3.67397 6.64159 4.05512 6.35284 4.54022C6.07564 5.02532 5.93704 5.56817 5.93704 6.16878V9.89365C5.93704 10.0323 5.99479 10.142 6.11029 10.2228L7.40967 10.9851V6.15145ZM16.2108 14.4328C16.7883 14.1787 17.2445 13.786 17.5794 13.2547C17.9259 12.7234 18.0992 12.1459 18.0992 11.5222C18.0992 10.9562 17.9548 10.4134 17.6661 9.89365C17.3773 9.3739 17.0019 8.9812 16.5399 8.71555L13.3002 6.84445C13.2309 6.79825 13.1673 6.78092 13.1096 6.79248C13.0518 6.79248 12.9941 6.8098 12.9363 6.84445L11.637 7.5721L15.8296 10.0149C15.9567 10.0842 16.0491 10.1766 16.1068 10.2921C16.1761 10.3961 16.2108 10.5231 16.2108 10.6733V14.4328ZM12.7284 5.6317C12.9825 5.47 13.2366 5.47 13.4907 5.6317L16.7825 7.55477C16.7825 7.47393 16.7825 7.36997 16.7825 7.24292C16.7825 6.68852 16.6439 6.163 16.3667 5.66635C16.101 5.15815 15.7141 4.7539 15.2059 4.4536C14.7093 4.1533 14.1318 4.00315 13.4734 4.00315C12.8959 4.00315 12.3935 4.12442 11.9661 4.36697L8.70904 6.23808C8.59354 6.31892 8.53579 6.42865 8.53579 6.56725V8.0572L12.7284 5.6317Z" />
    </svg>
  );
}

export function AuthPageCard({
  title,
  helperText,
  children,
  footer,
  className,
}: {
  title: string;
  helperText?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("w-full max-w-xs space-y-6", className)}>
      <div className="space-y-3 text-center">
        <img
          src="/transparent-logo.png"
          alt="OpenSEO"
          className="mx-auto size-10 rounded-lg"
        />
        <div>
          <h1 className="text-xl font-semibold text-balance">{title}</h1>
          {helperText ? (
            <p className="mt-1 text-sm text-muted-foreground">{helperText}</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-4">{children}</div>

      {footer ? <div className="text-center">{footer}</div> : null}
    </div>
  );
}

export function AuthPageShell({ children }: { children: React.ReactNode }) {
  return (
    // `h-[100dvh]` + `overflow-y-auto` makes this a scroll container, and the
    // auto-margin child centers when it fits but stays fully reachable (top and
    // bottom) when it's taller than the viewport. Plain `justify-center` clips
    // the overflow with no way to scroll to it.
    <div className="flex h-[100dvh] flex-col items-center overflow-y-auto bg-background p-4">
      <div className="m-auto flex w-full flex-col items-center">{children}</div>
    </div>
  );
}
