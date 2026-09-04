import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { IntegrationConnectionCard } from "@/client/features/integrations/IntegrationConnectionCard";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  configureIndexNow,
  getIndexNowStatus,
  submitIndexNowUrls,
  verifyIndexNowKey,
} from "@/serverFunctions/indexnow";

export function IndexNowConnectionCard({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [urlsText, setUrlsText] = React.useState("");
  const queryKey = ["indexNowStatus", projectId];
  const statusQuery = useQuery({
    queryKey,
    queryFn: () => getIndexNowStatus({ data: { projectId } }),
  });
  const status = statusQuery.data;
  const refresh = () => void queryClient.invalidateQueries({ queryKey });

  const configureMutation = useMutation({
    mutationFn: () => configureIndexNow({ data: { projectId } }),
    onSuccess: () => {
      toast.success("IndexNow key generated");
      refresh();
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });
  const verifyMutation = useMutation({
    mutationFn: () => verifyIndexNowKey({ data: { projectId } }),
    onSuccess: () => {
      toast.success("IndexNow key verified");
      refresh();
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });
  const submitMutation = useMutation({
    mutationFn: (urls: string[]) =>
      submitIndexNowUrls({ data: { projectId, urls, confirmed: true } }),
    onSuccess: (result) => {
      toast.success(`IndexNow submission: ${result.status}`);
      setUrlsText("");
      refresh();
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const urls = urlsText
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
  const verified = Boolean(status?.keyVerifiedAt);

  return (
    <IntegrationConnectionCard
      title="IndexNow"
      icon={<Send className="size-4" />}
      status={
        statusQuery.isLoading
          ? undefined
          : verified
            ? "connected"
            : status?.configured
              ? "setup_required"
              : "disconnected"
      }
    >
      {statusQuery.isLoading ? (
        <span className="loading loading-spinner loading-sm" />
      ) : !status?.configured ? (
        <div className="space-y-4">
          <p className="text-sm text-base-content/70">
            Generate a project key, publish its plain-text verification file,
            then notify participating search engines when public pages change.
          </p>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => configureMutation.mutate()}
            disabled={configureMutation.isPending}
          >
            Generate key
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="space-y-2 text-sm">
            <p>Publish a plain-text file containing only this public key:</p>
            <code className="block overflow-x-auto rounded bg-base-200 p-3 text-xs">
              {status.publicKey}
            </code>
            <p className="break-all text-xs text-base-content/60">
              {status.keyLocation}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => verifyMutation.mutate()}
                disabled={verifyMutation.isPending}
              >
                Verify key file
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  if (
                    window.confirm(
                      "Rotate the IndexNow key? The current key file will stop working.",
                    )
                  ) {
                    configureMutation.mutate();
                  }
                }}
                disabled={configureMutation.isPending}
              >
                Rotate key
              </button>
            </div>
          </div>

          {verified ? (
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="indexnow-urls">
                Changed public URLs (one per line)
              </label>
              <textarea
                id="indexnow-urls"
                className="textarea textarea-bordered min-h-28 w-full font-mono text-xs"
                value={urlsText}
                onChange={(event) => setUrlsText(event.target.value)}
                placeholder="https://example.com/new-page"
              />
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => submitMutation.mutate(urls)}
                disabled={urls.length === 0 || submitMutation.isPending}
              >
                Submit URLs
              </button>
              <p className="text-xs text-base-content/55">
                A successful response means the notification was received. It
                does not guarantee crawling or indexing.
              </p>
            </div>
          ) : (
            <p className="text-xs text-warning">
              URL submission stays disabled until the key file is verified.
            </p>
          )}

          {status.submissions.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-base-content/50">
                Recent submissions
              </p>
              <ul className="space-y-1 text-xs text-base-content/65">
                {status.submissions.slice(0, 5).map((submission) => (
                  <li key={submission.id}>
                    {submission.createdAt}: {submission.uniqueUrlCount} URL(s),{" "}
                    {submission.status}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </IntegrationConnectionCard>
  );
}
