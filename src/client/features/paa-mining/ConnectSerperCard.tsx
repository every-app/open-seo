import { useQuery } from "@tanstack/react-query";
import { Loader2, MessageSquareQuote, Settings2 } from "lucide-react";
import { getPaaMiningStatus } from "@/serverFunctions/paaMining";

export function ConnectSerperCard() {
  const { data } = useQuery({
    queryKey: ["paaMiningModule"],
    queryFn: () => getPaaMiningStatus(),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body items-start gap-4 p-6">
        <div className="flex size-10 items-center justify-center rounded-[3px] bg-base-200">
          <MessageSquareQuote className="size-5 text-base-content/40" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">
            Connect Serper.dev to enable PAA + Social Mining
          </h2>
          <p className="mt-1 text-sm text-base-content/65">
            Set the{" "}
            <code className="rounded bg-base-200 px-1 py-0.5 text-[12px]">
              SERPER_API_KEY
            </code>{" "}
            environment variable and restart the app. Get a key at{" "}
            <a
              href="https://serper.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="link link-primary"
            >
              serper.dev
            </a>
            .
          </p>
          <p className="mt-2 text-xs text-base-content/45">
            The module is dormant without a key. Existing OpenSEO features
            (keyword research, rank tracking, audits) keep working.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-base-content/50">
          {data === undefined ? (
            <>
              <Loader2 className="size-3 animate-spin" />
              <span>Checking status…</span>
            </>
          ) : data.configured ? (
            <span className="text-success">Connected.</span>
          ) : (
            <span>Not configured.</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function ModuleDisabledCard() {
  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body items-start gap-3 p-6">
        <div className="flex size-10 items-center justify-center rounded-[3px] bg-base-200">
          <Settings2 className="size-5 text-base-content/40" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Module turned off</h2>
          <p className="mt-1 text-sm text-base-content/65">
            The PAA + Social Mining module is disabled in this OpenSEO install.
            An operator can re-enable it under{" "}
            <strong>Settings &gt; Features</strong>.
          </p>
        </div>
      </div>
    </div>
  );
}
