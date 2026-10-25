import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { CardShell } from "@/client/components/CardShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { PermissionHint } from "@/client/components/PermissionHint";
import { QueryError } from "@/client/components/QueryState";
import { SafeExternalLink } from "@/client/components/SafeExternalLink";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/client/components/ui/alert";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Skeleton } from "@/client/components/ui/skeleton";
import { UmamiLoginForm } from "@/client/features/integrations/UmamiLoginForm";
import {
  loginLabel,
  SavedUmamiLogins,
  UmamiWebsiteSelect,
  type Website,
} from "@/client/features/integrations/UmamiPickers";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  deleteUmamiInstance,
  disconnectUmami,
  getUmamiConnection,
  listUmamiWebsites,
  setUmamiWebsite,
} from "@/serverFunctions/umami";
import { UMAMI_SETUP_DOCS_URL } from "@/shared/umami";
import { useLocale } from "@/client/lib/i18n";

const umamiConnectionQueryKey = (projectId: string) => [
  "umamiConnection",
  projectId,
];

type Step =
  | { kind: "idle" }
  | { kind: "add-login" }
  | { kind: "pick-website"; instanceId: string; websites: Website[] | null };

function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/**
 * Connects one project to an Umami website: add (or reuse) an Umami login
 * saved for the organization, pick a website, change it, or disconnect.
 */
export function UmamiConnectionCard({ projectId }: { projectId: string }) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const queryKey = umamiConnectionQueryKey(projectId);
  const connectionQuery = useQuery({
    queryKey,
    queryFn: () => getUmamiConnection({ data: { projectId } }),
  });
  const connection = connectionQuery.data;
  const [step, setStep] = React.useState<Step>({ kind: "idle" });
  const [websiteId, setWebsiteId] = React.useState<string | null>(null);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [removing, setRemoving] = React.useState<{
    id: string;
    label: string;
  } | null>(null);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: ["dashboardUmamiReport"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboardActivation"] }),
    ]);

  const loadWebsitesMutation = useMutation({
    mutationFn: (instanceId: string) =>
      listUmamiWebsites({ data: { projectId, instanceId } }),
    onSuccess: (result, instanceId) => {
      if ("problem" in result) {
        setProblem(result.problem.message);
        return;
      }
      setStep({ kind: "pick-website", instanceId, websites: result.websites });
    },
  });

  const setWebsiteMutation = useMutation({
    mutationFn: (input: { instanceId: string; websiteId: string }) =>
      setUmamiWebsite({
        data: { projectId, ...input, timeZone: browserTimeZone() },
      }),
    onSuccess: async (result) => {
      if ("problem" in result) {
        setProblem(result.problem.message);
        return;
      }
      await refresh();
      setStep({ kind: "idle" });
      toast.success("Umami connected");
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => disconnectUmami({ data: { projectId } }),
    onSuccess: refresh,
  });

  const deleteLoginMutation = useMutation({
    mutationFn: (instanceId: string) =>
      deleteUmamiInstance({ data: { projectId, instanceId } }),
    onSuccess: async () => {
      await refresh();
      setStep({ kind: "idle" });
      toast.success("Umami login removed");
    },
    onSettled: () => setRemoving(null),
  });

  const startPicking = (instanceId: string) => {
    setProblem(null);
    setWebsiteId(null);
    setStep({ kind: "pick-website", instanceId, websites: null });
    loadWebsitesMutation.mutate(instanceId);
  };

  const canManage = connection?.canManage === true;
  const instances = connection?.instances ?? [];
  const busy =
    loadWebsitesMutation.isPending ||
    setWebsiteMutation.isPending ||
    disconnectMutation.isPending ||
    deleteLoginMutation.isPending;
  const mutationError =
    loadWebsitesMutation.error ??
    setWebsiteMutation.error ??
    disconnectMutation.error ??
    deleteLoginMutation.error;
  // With no saved login there is nothing to pick, so the form opens directly.
  const showLoginForm =
    canManage &&
    (step.kind === "add-login" ||
      (step.kind === "idle" &&
        !connection?.connected &&
        instances.length === 0));

  return (
    <CardShell
      title={t("umami.card_title")}
      icon={<BarChart3 className="size-5" />}
      action={
        connection ? (
          <Badge variant={connection.connected ? "success" : "outline"}>
            <span className="size-1.5 rounded-full bg-current" />
            {connection.connected
              ? t("umami.status_connected")
              : t("umami.status_not_connected")}
          </Badge>
        ) : undefined
      }
    >
      {connectionQuery.isPending ? (
        <div
          role="status"
          aria-label="Loading connection"
          className="space-y-3"
        >
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-9 w-24" />
        </div>
      ) : !connection ? (
        <QueryError
          error={connectionQuery.error}
          fallback="Couldn't check this project's Umami connection."
          onRetry={() => void connectionQuery.refetch()}
          isRetrying={connectionQuery.isFetching}
        />
      ) : !connection.encryptionConfigured ? (
        <Alert variant="warning">
          <AlertTriangle className="size-4" />
          <AlertTitle>
            {t("umami.credential_encryption_not_configured")}
          </AlertTitle>
          <AlertDescription>
            <p>{t("umami.credential_encryption_desc")}</p>
            <SafeExternalLink
              url={UMAMI_SETUP_DOCS_URL}
              label={t("umami.open_setup_guide")}
              className="inline-flex items-center gap-1 font-medium underline underline-offset-2"
            />
          </AlertDescription>
        </Alert>
      ) : (
        <fieldset disabled={busy} className="space-y-4">
          {connection.connected && step.kind === "idle" ? (
            <div className="space-y-4">
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold">
                  {connection.websiteName}
                </p>
                <p className="mt-1 break-all text-sm text-muted-foreground">
                  {[
                    connection.websiteDomain,
                    instances.find((i) => i.id === connection.instanceId)
                      ?.baseUrl,
                    connection.timeZone,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              {canManage ? (
                <div className="flex flex-wrap items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      connection.instanceId &&
                      startPicking(connection.instanceId)
                    }
                  >
                    {t("umami.change_website")}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => disconnectMutation.mutate()}
                  >
                    {disconnectMutation.isPending
                      ? t("umami.disconnecting")
                      : t("umami.disconnect_project")}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {step.kind === "pick-website" ? (
            <div className="space-y-3">
              <UmamiWebsiteSelect
                websites={step.websites}
                value={websiteId}
                onChange={setWebsiteId}
              />
              <div className="flex flex-wrap gap-1">
                <Button
                  size="sm"
                  disabled={!websiteId}
                  onClick={() =>
                    websiteId &&
                    setWebsiteMutation.mutate({
                      instanceId: step.instanceId,
                      websiteId,
                    })
                  }
                >
                  {setWebsiteMutation.isPending
                    ? t("umami.saving")
                    : t("umami.use_this_website")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setProblem(null);
                    setStep({ kind: "idle" });
                  }}
                >
                  {t("umami.cancel")}
                </Button>
              </div>
            </div>
          ) : null}

          {showLoginForm ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t("umami.description")}
              </p>
              <UmamiLoginForm
                projectId={projectId}
                onSaved={async (result) => {
                  setProblem(null);
                  setWebsiteId(null);
                  await queryClient.invalidateQueries({ queryKey });
                  setStep({
                    kind: "pick-website",
                    instanceId: result.instance.id,
                    websites: result.websites,
                  });
                }}
              />
              {step.kind === "add-login" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep({ kind: "idle" })}
                >
                  {t("umami.cancel")}
                </Button>
              ) : null}
            </div>
          ) : null}

          {canManage && step.kind === "idle" && instances.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">{t("umami.saved_logins")}</p>
              <SavedUmamiLogins
                instances={instances}
                onChoose={startPicking}
                onRemove={(instance) =>
                  setRemoving({ id: instance.id, label: loginLabel(instance) })
                }
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep({ kind: "add-login" })}
              >
                {t("umami.add_another_login")}
              </Button>
            </div>
          ) : null}
        </fieldset>
      )}
      {problem ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {problem}
        </p>
      ) : mutationError ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {getStandardErrorMessage(mutationError)}
        </p>
      ) : null}
      {removing ? (
        <ConfirmDialog
          title={t("umami.remove_login_title", { label: removing.label })}
          confirmLabel={t("umami.remove_login_confirm")}
          destructive
          pending={deleteLoginMutation.isPending}
          onClose={() => setRemoving(null)}
          onConfirm={() => deleteLoginMutation.mutate(removing.id)}
        >
          {t("umami.remove_login_warning")}
        </ConfirmDialog>
      ) : null}
      {connection && !canManage ? (
        <PermissionHint
          action="change this project's connection"
          className="mt-3"
        />
      ) : null}
    </CardShell>
  );
}
