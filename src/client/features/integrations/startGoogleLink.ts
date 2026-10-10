import { startLinkRedirect } from "@/client/features/integrations/linkRedirect";
import { startGa4Link } from "@/serverFunctions/ga4";
import { startGscLink } from "@/serverFunctions/gsc";
import type { GoogleLinkProvider } from "@/shared/google-link";

const startLink: Record<GoogleLinkProvider, typeof startGscLink> = {
  gsc: startGscLink,
  ga4: startGa4Link,
};

/**
 * Kick off an incremental Google OAuth grant. Shared by the connection cards,
 * onboarding, property pickers, and re-engagement prompt so the link/error/
 * redirect flow stays in one place — callers keep their own analytics and
 * dismissal behavior.
 */
export function startGoogleLink(
  provider: GoogleLinkProvider,
  callbackURL: string,
): Promise<boolean> {
  return startLinkRedirect(startLink[provider], callbackURL);
}
