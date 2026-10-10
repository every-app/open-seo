import { Button } from "@/client/components/ui/button";
import { BingWebmasterLogo } from "@/client/features/integrations/BingWebmasterLogo";
import { BingApiKeyForm } from "@/client/features/integrations/BingApiKeyForm";

/** The not-yet-connected state: OAuth as the primary path, with the API-key
 *  form hidden behind a link until the user opts in. Either credential is
 *  verified with Bing before it is stored. */
export function BingConnectOptions({
  bingOAuthConfigured,
  adding,
  busy,
  linking,
  onConnect,
  onUseKey,
  apiKey,
  onApiKeyChange,
  onSaveKey,
  savingKey,
  onCancelKey,
}: {
  bingOAuthConfigured: boolean;
  adding: boolean;
  busy: boolean;
  linking: boolean;
  onConnect: () => void;
  onUseKey: () => void;
  apiKey: string;
  onApiKeyChange: (value: string) => void;
  onSaveKey: () => void;
  savingKey: boolean;
  onCancelKey: () => void;
}) {
  return (
    <div className="space-y-4">
      {bingOAuthConfigured ? (
        <Button
          onClick={onConnect}
          disabled={busy || linking}
          pending={linking}
        >
          <BingWebmasterLogo className="size-4" />
          Connect with Bing
        </Button>
      ) : null}
      {bingOAuthConfigured && !adding ? (
        <button
          type="button"
          disabled={busy}
          onClick={onUseKey}
          className="block text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
        >
          Or add an API key instead
        </button>
      ) : (
        <BingApiKeyForm
          apiKey={apiKey}
          onApiKeyChange={onApiKeyChange}
          onSave={onSaveKey}
          saving={savingKey}
          busy={busy}
          showCancel={bingOAuthConfigured}
          onCancel={onCancelKey}
        />
      )}
    </div>
  );
}
