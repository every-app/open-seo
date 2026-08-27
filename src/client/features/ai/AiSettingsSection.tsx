import { AiScopeSettings } from "@/client/features/ai/AiScopeSettings";

// Organization-scope AI settings (Settings → AI): provider/model/API
// key/Base URL overrides over the deployment environment defaults, with
// encrypted credential storage and live model discovery. See
// AiScopeSettings for the shared implementation.
export function AiSettingsSection() {
  return <AiScopeSettings scope="organization" />;
}