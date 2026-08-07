import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  disableIndexNow,
  getIndexNowConfig,
  getIndexingQueue,
  setIndexNowConfig,
  submitIndexNowUrls,
  verifyIndexNowKey,
} from "@/serverFunctions/indexnow";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function IndexingPage({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const configQuery = useQuery({
    queryKey: ["indexNowConfig", projectId],
    queryFn: () => getIndexNowConfig({ data: { projectId } }),
  });
  const queueQuery = useQuery({
    queryKey: ["indexingQueue", projectId],
    queryFn: () => getIndexingQueue({ data: { projectId, limit: 100 } }),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: ["indexNowConfig", projectId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["indexingQueue", projectId],
    });
  };

  const config = configQuery.data;
  const [host, setHost] = useState("");
  const [key, setKey] = useState("");
  const [keyLocation, setKeyLocation] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [urls, setUrls] = useState("");

  useEffect(() => {
    if (!config) return;
    setHost(config.host);
    setKey(config.key);
    setKeyLocation(config.keyLocation);
    setEnabled(config.enabled);
  }, [config]);

  const configMutation = useMutation({
    mutationFn: () =>
      setIndexNowConfig({
        data: { projectId, host, key, keyLocation, enabled },
      }),
    onSuccess: () => {
      toast.success("IndexNow configuration saved");
      invalidate();
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });
  const disableMutation = useMutation({
    mutationFn: () => disableIndexNow({ data: { projectId } }),
    onSuccess: () => {
      toast.success("IndexNow disabled");
      invalidate();
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });
  const verifyMutation = useMutation({
    mutationFn: () => verifyIndexNowKey({ data: { projectId } }),
    onSuccess: (result) => {
      toast[result.verified ? "success" : "error"](
        result.verified
          ? "IndexNow key verified"
          : "IndexNow key could not be verified",
      );
      invalidate();
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });
  const submitMutation = useMutation({
    mutationFn: () =>
      submitIndexNowUrls({
        data: {
          projectId,
          urls: urls
            .split(/\r?\n/)
            .map((url) => url.trim())
            .filter(Boolean),
        },
      }),
    onSuccess: (result) => {
      toast.success(
        `Submitted ${result.submitted} URL${result.submitted === 1 ? "" : "s"}`,
      );
      setUrls("");
      invalidate();
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  if (configQuery.isPending || queueQuery.isPending) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-base-content/60">
        <Loader2 className="size-4 animate-spin" /> Loading indexing settings…
      </div>
    );
  }
  if (configQuery.isError || queueQuery.isError) {
    return (
      <div className="alert alert-error m-6">
        <span>{getStandardErrorMessage(configQuery.error ?? queueQuery.error)}</span>
      </div>
    );
  }

  const canSubmit = Boolean(config?.enabled) && enabled && urls.trim().length > 0;

  return (
    <div className="overflow-auto px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto max-w-7xl space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Indexing</h1>
          <p className="text-sm text-base-content/70">
            Submit changed URLs to IndexNow and track every response.
          </p>
        </div>

        <section className="card border border-base-300 bg-base-100">
          <div className="card-body gap-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="card-title text-base">IndexNow configuration</h2>
                <p className="text-sm text-base-content/60">
                  The key file must be publicly available at the configured location.
                </p>
              </div>
              {config ? (
                <span className={`badge ${enabled ? "badge-success" : "badge-ghost"}`}>
                  {enabled ? "Enabled" : "Disabled"}
                </span>
              ) : null}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="form-control">
                <span className="label-text text-sm">Host</span>
                <input
                  className="input input-bordered w-full"
                  value={host}
                  onChange={(event) => setHost(event.target.value)}
                  placeholder="example.com"
                />
              </label>
              <label className="form-control">
                <span className="label-text text-sm">IndexNow key</span>
                <input
                  className="input input-bordered w-full font-mono"
                  value={key}
                  onChange={(event) => setKey(event.target.value)}
                  placeholder="your-hex-key"
                />
              </label>
              <label className="form-control md:col-span-2">
                <span className="label-text text-sm">Key location</span>
                <input
                  className="input input-bordered w-full"
                  value={keyLocation}
                  onChange={(event) => setKeyLocation(event.target.value)}
                  placeholder="https://example.com/your-hex-key.txt"
                />
              </label>
            </div>
            <label className="label cursor-pointer justify-start gap-3">
              <input
                type="checkbox"
                className="toggle toggle-primary"
                checked={enabled}
                onChange={(event) => setEnabled(event.target.checked)}
              />
              <span className="label-text">Enable submissions</span>
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn btn-primary btn-sm"
                onClick={() => configMutation.mutate()}
                disabled={configMutation.isPending}
              >
                {configMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Save configuration
              </button>
              {config ? (
                <>
                  <button
                    className="btn btn-outline btn-sm gap-1"
                    onClick={() => verifyMutation.mutate()}
                    disabled={verifyMutation.isPending}
                  >
                    {verifyMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                    Verify key
                  </button>
                  {enabled ? (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => disableMutation.mutate()}
                      disabled={disableMutation.isPending}
                    >
                      Disable
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        </section>

        <section className="card border border-base-300 bg-base-100">
          <div className="card-body gap-3">
            <div>
              <h2 className="card-title text-base">Submit URLs</h2>
              <p className="text-sm text-base-content/60">
                Add one absolute URL per line. OpenSEO batches submissions and retries rate limits automatically.
              </p>
            </div>
            <textarea
              className="textarea textarea-bordered min-h-32 w-full font-mono text-sm"
              value={urls}
              onChange={(event) => setUrls(event.target.value)}
              placeholder="https://example.com/page-one\nhttps://example.com/page-two"
            />
            <div>
              <button
                className="btn btn-primary btn-sm gap-1"
                onClick={() => submitMutation.mutate()}
                disabled={!canSubmit || submitMutation.isPending}
              >
                {submitMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                Submit to IndexNow
              </button>
              {!config ? <p className="mt-2 text-xs text-base-content/50">Save a configuration before submitting.</p> : null}
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-base-300 bg-base-100">
          <div className="flex items-center justify-between border-b border-base-300 px-4 py-3">
            <div>
              <h2 className="font-semibold">Queue and ledger</h2>
              <p className="text-xs text-base-content/60">Most recent indexing activity</p>
            </div>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => void queryClient.invalidateQueries({ queryKey: ["indexingQueue", projectId] })}
            >
              Refresh
            </button>
          </div>
          {(queueQuery.data ?? []).length === 0 ? (
            <div className="p-8 text-center text-sm text-base-content/60">No indexing events yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>URL</th>
                    <th>Event</th>
                    <th>Status</th>
                    <th>HTTP</th>
                    <th>Attempts</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {(queueQuery.data ?? []).map((event) => (
                    <tr key={event.id}>
                      <td className="max-w-sm truncate font-mono text-xs">{event.url}</td>
                      <td>{event.eventType}</td>
                      <td>
                        <span className={`badge badge-sm ${event.status === "success" ? "badge-success" : event.status === "error" ? "badge-error" : "badge-warning"}`}>
                          {event.status === "success" ? <CheckCircle2 className="mr-1 size-3" /> : null}
                          {event.status}
                        </span>
                      </td>
                      <td>{event.httpStatus ?? "—"}</td>
                      <td>{event.attempts}</td>
                      <td className="whitespace-nowrap text-xs">{formatDate(event.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
