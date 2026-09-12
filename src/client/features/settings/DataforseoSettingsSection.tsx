import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Check,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import {
  getDataforseoSettings,
  saveDataforseoSettingsFn,
  removeDataforseoSettingsFn,
  testDataforseoConnectionFn,
  type DataforseoConnectionTestResult,
} from "@/serverFunctions/dataforseoSettings";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  DataforseoCredentialsForm,
  DataforseoStatusCard,
  DataforseoTestAlert,
} from "@/client/features/settings/DataforseoSettingsParts";

interface DataforseoSettingsSectionProps {
  scope?: "organization" | "project";
  projectId?: string;
}

export function DataforseoSettingsSection({
  scope = "organization",
  projectId,
}: DataforseoSettingsSectionProps) {
  const queryClient = useQueryClient();
  const queryKey = ["dataforseoSettings", scope, projectId ?? null];

  const viewQuery = useQuery({
    queryKey,
    queryFn: () =>
      getDataforseoSettings({
        data: { projectId: projectId || undefined },
      }),
  });

  const [loginInput, setLoginInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [enabledInput, setEnabledInput] = useState<boolean | null>(null);
  const [testResult, setTestResult] =
    useState<DataforseoConnectionTestResult | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const data = viewQuery.data;

  useEffect(() => {
    if (data) {
      setEnabledInput(
        data.override ? data.override.enabled : data.enabled,
      );
      setLoginInput("");
      setPasswordInput("");
    }
  }, [data]);

  const override = data?.override;
  const isConfigured = data?.configured ?? false;
  const isEnabled = enabledInput ?? data?.enabled ?? true;

  const isDirty =
    loginInput.trim().length > 0 ||
    passwordInput.length > 0 ||
    (enabledInput !== null &&
      enabledInput !== (override?.enabled ?? data?.enabled ?? true));

  const saveMutation = useMutation({
    mutationFn: async () => {
      const patch: { login?: string; password?: string; enabled?: boolean } = {};
      if (loginInput.trim()) patch.login = loginInput.trim();
      if (passwordInput) patch.password = passwordInput;
      if (enabledInput !== null) patch.enabled = enabledInput;
      return saveDataforseoSettingsFn({
        data: { projectId: projectId || undefined, patch },
      });
    },
    onSuccess: async () => {
      toast.success("DataForSEO settings saved");
      setLoginInput("");
      setPasswordInput("");
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: (err) => {
      toast.error(getStandardErrorMessage(err, "Failed to save DataForSEO settings"));
    },
  });

  const removeMutation = useMutation({
    mutationFn: async () =>
      removeDataforseoSettingsFn({
        data: { projectId: projectId || undefined },
      }),
    onSuccess: async () => {
      toast.success("Custom credentials cleared; inheriting default configuration");
      setLoginInput("");
      setPasswordInput("");
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: (err) => {
      toast.error(getStandardErrorMessage(err, "Failed to clear credentials"));
    },
  });

  const testMutation = useMutation({
    mutationFn: async () =>
      testDataforseoConnectionFn({
        data: {
          projectId: projectId || undefined,
          login: loginInput.trim() ? loginInput.trim() : undefined,
          password: passwordInput ? passwordInput : undefined,
        },
      }),
    onSuccess: (res) => {
      setTestResult(res);
      setLastChecked(new Date());
      if (res.ok) {
        toast.success(
          res.balance !== null && res.balance !== undefined
            ? `Connected (Balance: $${res.balance.toFixed(2)})`
            : "Connected to DataForSEO",
        );
      } else if (res.reason === "CREDITS_UNAVAILABLE") {
        toast.warning("DataForSEO credits unavailable (HTTP 402)");
      } else if (res.reason === "INVALID_CREDENTIALS") {
        toast.error("DataForSEO authentication failed");
      } else {
        toast.error(`Connection failed: ${res.reason}`);
      }
    },
    onError: (err) => {
      toast.error(getStandardErrorMessage(err, "Failed to test connection"));
    },
  });

  if (viewQuery.isPending) {
    return (
      <div className="flex items-center gap-2 py-4">
        <span className="loading loading-spinner loading-sm" />
        <span className="text-sm text-base-content/50">Loading DataForSEO settings…</span>
      </div>
    );
  }

  return (
    <div className="rounded-box border border-base-300 bg-base-100 p-5 space-y-6">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold">DataForSEO</h3>
            <span className="badge badge-sm badge-outline text-base-content/70">
              Paid SEO data provider
            </span>
          </div>
          {override && (
            <span className="badge badge-sm badge-info badge-outline">
              {scope === "project" ? "Project override" : "Organization override"}
            </span>
          )}
        </div>
        <p className="text-xs text-base-content/60 leading-relaxed">
          DataForSEO provides paid SEO data used for keyword metrics, keyword research and
          SERP data. OpenSEO will continue using available free and cached data when
          DataForSEO is unavailable.
        </p>
      </div>

      <DataforseoStatusCard
        testResult={testResult}
        isConfigured={isConfigured}
        isEnabled={isEnabled}
        source={data?.source}
        lastChecked={lastChecked}
      />

      {testResult && <DataforseoTestAlert result={testResult} />}

      <DataforseoCredentialsForm
        loginInput={loginInput}
        onLoginChange={setLoginInput}
        passwordInput={passwordInput}
        onPasswordChange={setPasswordInput}
        isEnabled={isEnabled}
        onEnabledChange={setEnabledInput}
        loginMasked={data?.loginMasked}
        passwordConfigured={data?.passwordConfigured}
      />

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-base-200 pt-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-outline btn-sm gap-1.5"
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending || saveMutation.isPending}
          >
            {testMutation.isPending ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Testing…
              </>
            ) : (
              <>
                <RefreshCw className="size-3.5" />
                Test Connection
              </>
            )}
          </button>

          {override && (
            <button
              type="button"
              className="btn btn-ghost btn-sm text-error gap-1.5"
              onClick={() => removeMutation.mutate()}
              disabled={removeMutation.isPending || saveMutation.isPending}
            >
              <Trash2 className="size-3.5" />
              Clear Credentials
            </button>
          )}
        </div>

        <button
          type="button"
          className="btn btn-primary btn-sm gap-1.5"
          onClick={() => saveMutation.mutate()}
          disabled={!isDirty || saveMutation.isPending}
        >
          {saveMutation.isPending ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Check className="size-3.5" />
              Save Changes
            </>
          )}
        </button>
      </div>
    </div>
  );
}
