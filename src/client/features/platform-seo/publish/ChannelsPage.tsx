import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Send, Unplug } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { QueryState } from "@/client/components/QueryState";
import { SafeExternalLink } from "@/client/components/SafeExternalLink";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/client/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/client/components/ui/alert-dialog";
import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import {
  connectDevto,
  connectHashnode,
  disconnectChannel,
  listChannels,
} from "@/serverFunctions/platformSeo";
import { topicQueryKeys } from "../topics/topicQueryKeys";

type Channel = Awaited<ReturnType<typeof listChannels>>["channels"][number];

export function ChannelsPage({ projectId }: { projectId: string }) {
  const channels = useQuery({
    queryKey: topicQueryKeys.channels(projectId),
    queryFn: () => listChannels({ data: { projectId } }),
  });

  return (
    <div className="px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <PageHeader
          title="Channels"
          description="Accounts your articles are republished to, each with a canonical link back to the original on your site. Shared by every project in this organization."
        />
        <QueryState query={channels} errorFallback="Failed to load channels.">
          {(data) => (
            <>
              {data.channels.length === 0 ? (
                <EmptyState
                  icon={Send}
                  title="No channels yet"
                  description="Connect Dev.to or Hashnode below."
                />
              ) : (
                <div className="flex flex-col gap-2">
                  {data.channels.map((channel) => (
                    <ChannelRow
                      key={channel.id}
                      projectId={projectId}
                      channel={channel}
                      canManage={data.canManage}
                    />
                  ))}
                </div>
              )}
              {!data.canManage ? (
                <p className="text-sm text-muted-foreground">
                  An owner or admin of this organization connects channels.
                </p>
              ) : data.canConnect ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <ConnectDevto projectId={projectId} />
                  <ConnectHashnode projectId={projectId} />
                </div>
              ) : (
                <Alert>
                  <AlertTitle>Connecting needs CHANNEL_TOKEN_SECRET</AlertTitle>
                  <AlertDescription>
                    Set CHANNEL_TOKEN_SECRET to at least 32 random characters
                    (for example, the output of openssl rand -hex 32) in this
                    deployment's environment and restart the app. It encrypts
                    the tokens you connect; keep it once set.
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}
        </QueryState>
      </div>
    </div>
  );
}

function useRefreshChannels(projectId: string) {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({
      queryKey: topicQueryKeys.channels(projectId),
    });
}

function ChannelRow({
  projectId,
  channel,
  canManage,
}: {
  projectId: string;
  channel: Channel;
  canManage: boolean;
}) {
  const refresh = useRefreshChannels(projectId);
  const [confirm, setConfirm] = useState(false);
  const disconnect = useMutation({
    mutationFn: () =>
      disconnectChannel({ data: { projectId, channelId: channel.id } }),
    onSuccess: async ({ outcome }) => {
      setConfirm(false);
      if (outcome === "in_use") {
        toast.error(
          `${channel.displayName} has published posts that are being tracked, so it stays connected.`,
        );
        return;
      }
      await refresh();
      toast.success(`Disconnected ${channel.displayName}`);
    },
  });

  return (
    <Card size="sm">
      <CardContent className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{channel.displayName}</p>
          {channel.accountUrl ? (
            <SafeExternalLink
              url={channel.accountUrl}
              label={channel.accountUrl}
              className="text-xs text-muted-foreground hover:underline"
            />
          ) : null}
        </div>
        {canManage ? (
          <Button variant="ghost" size="sm" onClick={() => setConfirm(true)}>
            <Unplug />
            Disconnect
          </Button>
        ) : null}
      </CardContent>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Disconnect {channel.displayName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Its token is deleted, along with copies prepared for it here.
              Drafts already on the platform stay there.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              pending={disconnect.isPending}
              onClick={() => disconnect.mutate()}
            >
              Disconnect
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function ConnectDevto({ projectId }: { projectId: string }) {
  const refresh = useRefreshChannels(projectId);
  const [apiKey, setApiKey] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const connect = useMutation({
    mutationFn: () => connectDevto({ data: { projectId, apiKey } }),
    onSuccess: async (result) => {
      if (result.outcome !== "connected") {
        setProblem(
          result.outcome === "problem" ? result.message : "Try again.",
        );
        return;
      }
      setProblem(null);
      setApiKey("");
      await refresh();
      toast.success(
        result.replaced ? "Dev.to key updated" : "Dev.to connected",
      );
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dev.to</CardTitle>
        <CardDescription>
          Create an API key under{" "}
          <SafeExternalLink
            url="https://dev.to/settings/extensions"
            label="Settings → Extensions"
            className="underline"
          />{" "}
          and paste it here. It's checked with Dev.to, then stored encrypted.
          Connecting the same account again replaces its key.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (apiKey.trim().length >= 8) connect.mutate();
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="devto-key">API key</Label>
            <Input
              id="devto-key"
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
            />
          </div>
          {problem ? (
            <p className="text-sm text-destructive" role="alert">
              {problem}
            </p>
          ) : null}
          <div>
            <Button
              type="submit"
              pending={connect.isPending}
              disabled={apiKey.trim().length < 8}
            >
              Connect Dev.to
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ConnectHashnode({ projectId }: { projectId: string }) {
  const refresh = useRefreshChannels(projectId);
  const [token, setToken] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [choices, setChoices] = useState<
    { id: string; title: string; url: string | null }[]
  >([]);
  const connect = useMutation({
    mutationFn: (publicationId?: string) =>
      connectHashnode({ data: { projectId, token, publicationId } }),
    onSuccess: async (result) => {
      if (result.outcome === "choose") {
        setProblem(null);
        setChoices(result.publications);
        return;
      }
      if (result.outcome === "problem") {
        setProblem(result.message);
        return;
      }
      setProblem(null);
      setChoices([]);
      setToken("");
      await refresh();
      toast.success(
        result.replaced ? "Hashnode token updated" : "Hashnode connected",
      );
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hashnode</CardTitle>
        <CardDescription>
          Create a Personal Access Token in Hashnode → Account settings →
          Developer. Hashnode's API only works for blogs on its Pro plan.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (token.trim().length >= 8) connect.mutate(undefined);
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="hashnode-token">Personal Access Token</Label>
            <Input
              id="hashnode-token"
              type="password"
              autoComplete="off"
              value={token}
              onChange={(event) => {
                setToken(event.target.value);
                setChoices([]);
              }}
            />
          </div>
          {problem ? (
            <p className="text-sm text-destructive" role="alert">
              {problem}
            </p>
          ) : null}
          {choices.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm">Which blog should posts go to?</p>
              {choices.map((publication) => (
                <Button
                  key={publication.id}
                  type="button"
                  variant="outline"
                  className="justify-start"
                  disabled={connect.isPending}
                  onClick={() => connect.mutate(publication.id)}
                >
                  {publication.title}
                  {publication.url ? (
                    <span className="truncate text-muted-foreground">
                      {publication.url}
                    </span>
                  ) : null}
                </Button>
              ))}
            </div>
          ) : (
            <div>
              <Button
                type="submit"
                pending={connect.isPending}
                disabled={token.trim().length < 8}
              >
                Connect Hashnode
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
