import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  XCircle,
} from "lucide-react";
import type {
  DataforseoConnectionTestResult,
  DataforseoApiStatusResult,
} from "@/serverFunctions/dataforseoSettings";

export function formatSource(src?: string): string {
  switch (src) {
    case "project":
      return "Project";
    case "organization":
      return "Organization";
    case "environment":
      return "Environment";
    default:
      return "Not configured";
  }
}

export function DataforseoStatusCard({
  testResult,
  isConfigured,
  isEnabled,
  source,
  lastChecked,
}: {
  testResult: DataforseoConnectionTestResult | null;
  isConfigured: boolean;
  isEnabled: boolean;
  source?: string;
  lastChecked: Date | null;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 rounded-lg bg-base-200/50 p-3.5 text-xs">
      <div>
        <span className="text-base-content/50 block font-medium">Status</span>
        <div className="mt-1 flex items-center gap-1.5 font-medium">
          {testResult ? (
            testResult.ok ? (
              <span className="flex items-center gap-1 text-success">
                <span className="inline-block size-2 rounded-full bg-success" />
                Connected
              </span>
            ) : testResult.reason === "CREDITS_UNAVAILABLE" ? (
              <span className="flex items-center gap-1 text-warning">
                <AlertTriangle className="size-3" />
                Credits unavailable
              </span>
            ) : testResult.reason === "INVALID_CREDENTIALS" ? (
              <span className="flex items-center gap-1 text-error">
                <XCircle className="size-3" />
                Auth failed
              </span>
            ) : (
              <span className="flex items-center gap-1 text-error">
                <XCircle className="size-3" />
                Failed
              </span>
            )
          ) : !isConfigured ? (
            <span className="text-base-content/50">○ Not configured</span>
          ) : !isEnabled ? (
            <span className="text-base-content/50">○ Disabled</span>
          ) : (
            <span className="flex items-center gap-1 text-success">
              <span className="inline-block size-2 rounded-full bg-success" />
              Configured
            </span>
          )}
        </div>
      </div>

      <div>
        <span className="text-base-content/50 block font-medium">Source</span>
        <div className="mt-1 font-medium">
          {source === "environment" ? (
            <span className="text-base-content/80">Environment</span>
          ) : (
            <span className="text-base-content/80">{formatSource(source)}</span>
          )}
        </div>
      </div>

      <div>
        <span className="text-base-content/50 block font-medium">Balance</span>
        <div className="mt-1 font-medium tabular-nums">
          {testResult?.balance !== null && testResult?.balance !== undefined ? (
            <span className="text-success font-semibold">
              ${testResult.balance.toFixed(2)}
            </span>
          ) : testResult?.ok ? (
            <span className="text-base-content/60">Unavailable</span>
          ) : (
            <span className="text-base-content/40">—</span>
          )}
        </div>
      </div>

      <div>
        <span className="text-base-content/50 block font-medium">
          Last checked
        </span>
        <div className="mt-1 text-base-content/70">
          {lastChecked ? (
            lastChecked.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })
          ) : (
            <span className="text-base-content/40">Not checked</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function DataforseoTestAlert({
  result,
}: {
  result: DataforseoConnectionTestResult;
}) {
  return (
    <div
      className={`flex items-start gap-2.5 rounded-lg border p-3 text-xs leading-relaxed ${
        result.ok
          ? "border-success/30 bg-success/10 text-success"
          : result.reason === "CREDITS_UNAVAILABLE"
            ? "border-warning/30 bg-warning/10 text-warning"
            : "border-error/30 bg-error/10 text-error"
      }`}
    >
      {result.ok ? (
        <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
      ) : (
        <AlertTriangle className="size-4 shrink-0 mt-0.5" />
      )}
      <div className="flex-1">
        <span className="font-semibold block">
          {result.ok
            ? "Connection verified"
            : result.reason === "CREDITS_UNAVAILABLE"
              ? "Credits unavailable (HTTP 402)"
              : result.reason === "INVALID_CREDENTIALS"
                ? "Authentication failed (HTTP 401)"
                : `Connection error: ${result.reason}`}
        </span>
        {result.balance !== null && result.balance !== undefined && (
          <p className="mt-0.5">
            Account balance: ${result.balance.toFixed(2)} USD
          </p>
        )}
      </div>
    </div>
  );
}

export function DataforseoCredentialsForm({
  loginInput,
  onLoginChange,
  passwordInput,
  onPasswordChange,
  isEnabled,
  onEnabledChange,
  loginMasked,
  passwordConfigured,
}: {
  loginInput: string;
  onLoginChange: (val: string) => void;
  passwordInput: string;
  onPasswordChange: (val: string) => void;
  isEnabled: boolean;
  onEnabledChange: (val: boolean) => void;
  loginMasked?: string | null;
  passwordConfigured?: boolean;
}) {
  return (
    <div className="space-y-4">
      {/* API Login */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="dataforseo-login"
          className="text-xs font-medium text-base-content/80"
        >
          API Login
        </label>
        <input
          id="dataforseo-login"
          type="text"
          value={loginInput}
          onChange={(e) => onLoginChange(e.target.value)}
          placeholder={loginMasked ?? "API login email (e.g. user@example.com)"}
          autoComplete="off"
          className="input input-bordered input-sm w-full font-mono text-xs"
        />
        {loginMasked && !loginInput && (
          <p className="text-[11px] text-base-content/50">
            Current login:{" "}
            <span className="font-mono text-base-content/70">
              {loginMasked}
            </span>
          </p>
        )}
      </div>

      {/* API Password */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="dataforseo-password"
          className="text-xs font-medium text-base-content/80"
        >
          API Password
        </label>
        <input
          id="dataforseo-password"
          type="password"
          value={passwordInput}
          onChange={(e) => onPasswordChange(e.target.value)}
          placeholder={
            passwordConfigured ? "••••••••••••••••" : "API password or API key"
          }
          autoComplete="new-password"
          className="input input-bordered input-sm w-full font-mono text-xs"
        />
        <p className="text-[11px] text-base-content/50">
          {passwordConfigured
            ? "Leave blank to keep current password."
            : "Required for first-time configuration. Encrypted at rest."}
        </p>
      </div>

      {/* Enabled Toggle */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <span className="text-xs font-medium text-base-content/80 block">
            DataForSEO usage
          </span>
          <p className="text-[11px] text-base-content/50">
            When disabled, DataForSEO network requests are suspended and
            fallback sources are used.
          </p>
        </div>
        <input
          type="checkbox"
          className="toggle toggle-primary toggle-sm"
          checked={isEnabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
          aria-label="Toggle DataForSEO usage"
        />
      </div>
    </div>
  );
}

function formatApiStatus(status: string): string {
  switch (status.toLowerCase()) {
    case "ok":
      return "Operational";
    case "major_outage":
      return "Major outage";
    case "partial_outage":
      return "Partial outage";
    case "long_response_time":
      return "Slow response";
    case "long_execution_time":
      return "Slow execution";
    case "webhook_delay":
      return "Webhook delay";
    case "send_delay":
      return "Send delay";
    default:
      return status.replace(/_/g, " ");
  }
}

function getApiStatusClass(status: string): string {
  switch (status.toLowerCase()) {
    case "ok":
      return "text-success font-medium";
    case "major_outage":
      return "text-error font-medium";
    case "partial_outage":
    case "long_response_time":
    case "long_execution_time":
    case "webhook_delay":
    case "send_delay":
      return "text-warning font-medium";
    default:
      return "text-base-content/70 font-medium";
  }
}

export function DataforseoApiHealthCard({
  statusResult,
  isLoading,
  lastChecked,
  onCheckStatus,
  disabled,
}: {
  statusResult: DataforseoApiStatusResult | null;
  isLoading: boolean;
  lastChecked: Date | null;
  onCheckStatus: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-lg border border-base-300 bg-base-200/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-base-content/70" />
          <h4 className="text-sm font-semibold text-base-content">
            DataForSEO API Health
          </h4>
        </div>
        <button
          type="button"
          className="btn btn-outline btn-sm h-8 min-h-8 px-3 text-xs"
          onClick={onCheckStatus}
          disabled={disabled || isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Checking…
            </>
          ) : (
            "Check API Status"
          )}
        </button>
      </div>

      <p className="text-xs text-base-content/60 leading-relaxed">
        Per-API endpoint health from DataForSEO&apos;s free status endpoint. A
        successful connection test above proves authentication and balance — it
        does not prove every API is available.
      </p>

      {statusResult && statusResult.ok ? (
        <div className="space-y-1 pt-1">
          {statusResult.endpoints.map((ep) => (
            <div
              key={ep.api}
              className="flex items-center justify-between text-xs py-0.5"
            >
              <span className="font-mono text-base-content/80">{ep.api}</span>
              <span className={getApiStatusClass(ep.status)}>
                {formatApiStatus(ep.status)}
              </span>
            </div>
          ))}
        </div>
      ) : statusResult && !statusResult.ok ? (
        <div className="text-xs text-error py-1">
          Failed to retrieve API health ({statusResult.reason}). Check your
          credentials.
        </div>
      ) : (
        <div className="text-xs text-base-content/40 italic py-1">
          Endpoint status has not been checked yet. Click &ldquo;Check API
          Status&rdquo; above to query endpoint health.
        </div>
      )}

      <div className="text-xs text-base-content/50 pt-1">
        Last checked:{" "}
        {lastChecked
          ? lastChecked.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })
          : "Not checked"}
      </div>
    </div>
  );
}
