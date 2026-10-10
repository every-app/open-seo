import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { BING_WEBMASTER_API_KEY_DOCS_URL } from "@/shared/bing";

/** Paste-a-key form, shared by the empty state and the picker's add-account
 *  step. OAuth (when configured) is offered next to it, never instead of it. */
export function BingApiKeyForm({
  apiKey,
  onApiKeyChange,
  onSave,
  saving,
  busy,
  showCancel,
  onCancel,
}: {
  apiKey: string;
  onApiKeyChange: (value: string) => void;
  onSave: () => void;
  saving: boolean;
  busy: boolean;
  showCancel: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Paste a Bing Webmaster Tools API key. Generate one in{" "}
        <a
          href={BING_WEBMASTER_API_KEY_DOCS_URL}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          Settings → API Access
        </a>
        . Each Bing account has its own key; add as many as you need. Use the
        account-level API key — not a per-site IndexNow key. The key is stored
        encrypted and never shown again.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1">
          <label
            htmlFor="bing-api-key"
            className="mb-1.5 block text-sm font-medium"
          >
            API key
          </label>
          <Input
            id="bing-api-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={apiKey}
            onChange={(event) => onApiKeyChange(event.target.value)}
            placeholder="Bing Webmaster API key"
          />
        </div>
        <Button
          onClick={onSave}
          disabled={busy || apiKey.trim().length === 0}
          pending={saving}
        >
          Add account
        </Button>
        {showCancel ? (
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  );
}
