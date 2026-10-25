import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Unplug } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { SectionHeader } from "@/client/components/PageHeader";
import { QueryState } from "@/client/components/QueryState";
import { RowActionsMenu } from "@/client/components/RowActionsMenu";
import { DropdownMenuItem } from "@/client/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { useOrganizations } from "@/client/features/settings/useOrganizations";
import { useLocale } from "@/client/lib/i18n";
import { captureClientEvent } from "@/client/lib/posthog";
import {
  listMcpConnections,
  revokeMcpConnection,
} from "@/serverFunctions/mcp-connections";

export function McpConnectionsSettings() {
  const queryClient = useQueryClient();
  const { t } = useLocale();
  const [disconnecting, setDisconnecting] = useState<{
    id: string;
    clientName: string;
  } | null>(null);
  const { hasMultiple: showOrganization, organizationName } =
    useOrganizations();

  const connectionsQuery = useQuery({
    queryKey: ["mcpConnections"],
    queryFn: () => listMcpConnections(),
  });

  const disconnectMutation = useMutation({
    mutationFn: (grantId: string) => revokeMcpConnection({ data: { grantId } }),
    onSuccess: () => {
      captureClientEvent("mcp:connection_revoked");
      toast.success(t("settings.connected_agents_success"));
      setDisconnecting(null);
      void queryClient.invalidateQueries({ queryKey: ["mcpConnections"] });
    },
  });

  return (
    <section className="space-y-3">
      <SectionHeader title={t("settings.connected_agents_title")} />
      <p className="text-sm">{t("settings.connected_agents_desc")}</p>

      <QueryState
        query={connectionsQuery}
        errorFallback={t("settings.connected_agents_error")}
      >
        {(connections) =>
          connections.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("settings.connected_agents_empty")}
            </p>
          ) : (
            <TableCard>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("settings.connected_agents_client")}</TableHead>
                    {showOrganization ? (
                      <TableHead>{t("settings.connected_agents_organization")}</TableHead>
                    ) : null}
                    <TableHead>{t("settings.connected_agents_connected")}</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {connections.map((connection) => (
                    <TableRow key={connection.id}>
                      <TableCell className="max-w-[220px] truncate font-medium">
                        {connection.clientName}
                      </TableCell>
                      {showOrganization ? (
                        <TableCell className="text-xs text-muted-foreground">
                          {organizationName(connection.organizationId) ?? "—"}
                        </TableCell>
                      ) : null}
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(connection.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <RowActionsMenu
                          label={`${t("settings.connected_agents_actions")} ${connection.clientName}`}
                        >
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() =>
                              setDisconnecting({
                                id: connection.id,
                                clientName: connection.clientName,
                              })
                            }
                          >
                            <Unplug />
                            {t("settings.connected_agents_disconnect")}
                          </DropdownMenuItem>
                        </RowActionsMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableCard>
          )
        }
      </QueryState>

      {disconnecting ? (
        <ConfirmDialog
          title={t("settings.connected_agents_disconnect_title", {
            name: disconnecting.clientName,
          })}
          confirmLabel={t("settings.connected_agents_disconnect_confirm")}
          destructive
          pending={disconnectMutation.isPending}
          onClose={() => setDisconnecting(null)}
          onConfirm={() => disconnectMutation.mutate(disconnecting.id)}
        >
          {t("settings.connected_agents_disconnect_warning")}
        </ConfirmDialog>
      ) : null}
    </section>
  );
}
