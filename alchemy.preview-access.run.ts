import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import {
  emailAccessGate,
  previewWildcard,
  readWorkersSubdomain,
  requireAllowedEmails,
} from "./alchemy.access.ts";

// Persistent account-level security boundary for every ephemeral preview.
// This stack is intentionally separate from alchemy.run.ts: destroying one
// preview must never remove the wildcard Access application protecting all of
// the others. The wildcard hostname derives from the same worker naming the
// deploy stack uses (alchemy.access.ts).
//
// This gates the stable stage hostname (`open-seo-<stage>.<sub>`). Cloudflare
// version preview URLs (`<version>-open-seo-<stage>.<sub>`) sit outside this
// wildcard, but alchemy uploads each version with no preview provisioned
// (`has_preview: false`), so none are served — see docs/PREVIEW_DEPLOYMENTS.md.
export default Alchemy.Stack(
  "open-seo-preview-access",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const subdomain = yield* readWorkersSubdomain({ required: true });
    const allowedEmails = yield* requireAllowedEmails(
      "Set ACCESS_ALLOWED_EMAILS to the comma-separated preview testers.",
    );

    const hostname = previewWildcard(subdomain);
    const application = yield* emailAccessGate({
      policyId: "PreviewAllowTeam",
      applicationId: "PreviewAccess",
      policyName: "open-seo preview team",
      applicationName: "open-seo preview environments",
      domain: hostname,
      emails: allowedEmails,
    });

    return {
      hostname,
      applicationId: application.applicationId,
      aud: application.aud,
    };
  }),
);
