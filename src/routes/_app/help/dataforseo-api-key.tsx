import { createFileRoute } from "@tanstack/react-router";
import {
  CommandBlock,
  helpLinkClassName,
  SecretHelpPage,
} from "@/client/features/help/SecretHelpPage";

const DATAFORSEO_API_ACCESS_URL = "https://app.dataforseo.com/api-access";

export const Route = createFileRoute("/_app/help/dataforseo-api-key")({
  component: DataforseoApiKeyHelpPage,
});

function DataforseoApiKeyHelpPage() {
  return (
    <SecretHelpPage
      title="Set up your DataForSEO API key"
      intro={
        <>
          OpenSEO needs the <code>DATAFORSEO_API_KEY</code> secret before
          keyword, domain, and SEO data workflows can run.
        </>
      }
      secretName="DATAFORSEO_API_KEY"
      steps={
        <>
          <li>
            Go to{" "}
            <a
              className={helpLinkClassName}
              href={DATAFORSEO_API_ACCESS_URL}
              target="_blank"
              rel="noreferrer"
            >
              DataForSEO API Access
            </a>{" "}
            and request API credentials by email.
          </li>
          <li>
            Base64 encode your DataForSEO login and API password in this format:
            <CommandBlock command="printf '%s' 'YOUR_LOGIN:YOUR_PASSWORD' | base64" />
          </li>
          <li>
            Save the output as the <code>DATAFORSEO_API_KEY</code> secret in
            your environment.
          </li>
        </>
      }
      dashboardPasteStep="Paste the base64 value from the terminal command above and save."
      terminalPromptHint={
        <>
          Use the base64 value of <code>login:password</code> when prompted.
        </>
      }
    />
  );
}
