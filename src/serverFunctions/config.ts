import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";

// E2E runs serve fixture data and never call DataForSEO, so a missing key must
// not raise the blocking setup modal — it covers the page and eats every click.
function shouldUseE2eFixtures() {
  return (
    import.meta.env.VITE_E2E_KEYWORD_FIXTURES === "1" ||
    import.meta.env.VITE_E2E_DOMAIN_FIXTURES === "1"
  );
}

export const getSeoApiKeyStatus = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(() => {
    const configured =
      shouldUseE2eFixtures() || Boolean(env.DATAFORSEO_API_KEY?.trim());
    return { configured };
  });
