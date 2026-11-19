import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { SectionHeader } from "@/client/components/PageHeader";
import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Progress } from "@/client/components/ui/progress";
import { organizationContextQueryOptions } from "@/client/features/team/organizationQueries";
import { CommandBlock } from "@/client/features/help/SecretHelpPage";
import { Step } from "@/client/features/every-app/Step";
import { hasOrgPermission } from "@/lib/org-permissions";
import {
  MovePhase,
  runMove,
  type MoveState,
} from "@/client/features/every-app/runEveryAppMove";
import { parseTransferCode } from "@/shared/every-app-transfer";

enum GatewayPath {
  SetUp = "set-up",
  Existing = "existing",
}

/** Settings → Move to Every App, on self-hosted installs, for owners. */
export function MoveToEveryAppSettings() {
  const { data: organization } = useQuery(organizationContextQueryOptions());
  const [open, setOpen] = useState(false);
  if (
    !organization ||
    !hasOrgPermission(organization.role, { organization: ["delete"] })
  ) {
    return null;
  }
  return (
    <section className="space-y-3">
      <SectionHeader title="Every App" />
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-sm">Move to Every App</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Get team sign-in and all your apps in one place. Every project,
            history and chat moves over intact.{" "}
            <a
              className="text-primary underline-offset-4 hover:underline"
              href="https://everyapp.com/docs/apps/openseo"
              target="_blank"
              rel="noreferrer"
            >
              About Every App
            </a>
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          Move to Every App
        </Button>
      </div>
      {open ? <MoveDialog onClose={() => setOpen(false)} /> : null}
    </section>
  );
}

function MoveDialog({ onClose }: { onClose: () => void }) {
  const [path, setPath] = useState(GatewayPath.SetUp);
  const [state, setState] = useState<MoveState>({ status: "idle" });
  const stopped = useRef(false);
  const moving = state.status === "moving";

  const close = () => {
    stopped.current = true;
    onClose();
  };

  return (
    <Dialog
      open
      // A click outside or Escape mustn't stop a move halfway.
      onOpenChange={(next) => {
        if (!next && !moving) close();
      }}
    >
      <DialogContent className="grid-cols-1 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Move to Every App</DialogTitle>
          <DialogDescription>
            Copies your projects and their history to OpenSEO on your Gateway.
            Nothing is removed here.
          </DialogDescription>
        </DialogHeader>
        {state.status === "moving" ? (
          <MoveProgress state={state} />
        ) : state.status === "done" ? (
          <MoveDone origin={state.origin} />
        ) : (
          <>
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Do you already have an Every App Gateway?
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  aria-pressed={path === GatewayPath.SetUp}
                  className="aria-pressed:border-primary aria-pressed:bg-primary/10"
                  onClick={() => setPath(GatewayPath.SetUp)}
                >
                  Set up my Gateway
                </Button>
                <Button
                  variant="outline"
                  aria-pressed={path === GatewayPath.Existing}
                  className="aria-pressed:border-primary aria-pressed:bg-primary/10"
                  onClick={() => setPath(GatewayPath.Existing)}
                >
                  I have a Gateway
                </Button>
              </div>
            </div>
            {path === GatewayPath.SetUp ? (
              <GatewaySetupSteps
                onReady={() => setPath(GatewayPath.Existing)}
              />
            ) : (
              <MoveSteps
                failure={state.status === "failed" ? state.message : null}
                onMove={(code) => {
                  stopped.current = false;
                  void runMove(code, setState, stopped);
                }}
              />
            )}
          </>
        )}
        <DialogFooter>
          <Button
            variant={state.status === "done" ? "default" : "ghost"}
            onClick={close}
          >
            {state.status === "done" ? "Done" : moving ? "Stop" : "Cancel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GatewaySetupSteps({ onReady }: { onReady: () => void }) {
  return (
    <ol className="space-y-4">
      <Step number={1} title="Get Every App">
        <CommandBlock command="npm install -g everyapp@latest" />
      </Step>
      <Step number={2} title="Create your Gateway">
        <CommandBlock command="everyapp setup" />
        <p className="text-sm text-muted-foreground">
          Needs{" "}
          <a
            className="font-medium text-primary underline-offset-4 hover:underline"
            href="https://dash.cloudflare.com/"
            target="_blank"
            rel="noreferrer"
          >
            Cloudflare Workers Paid
          </a>{" "}
          and a domain on Cloudflare DNS.
        </p>
      </Step>
      <li>
        <Button variant="outline" onClick={onReady}>
          My Gateway is ready
        </Button>
      </li>
    </ol>
  );
}

function MoveSteps({
  failure,
  onMove,
}: {
  failure: string | null;
  onMove: (code: string) => void;
}) {
  const [code, setCode] = useState("");
  const codeIsValid = parseTransferCode(code) !== null;

  return (
    <ol className="space-y-4">
      <Step number={1} title="Install OpenSEO on your Gateway">
        <CommandBlock command="everyapp install https://github.com/every-app/open-seo" />
      </Step>
      <Step number={2} title="Make a transfer code">
        <p className="text-sm text-muted-foreground">
          In OpenSEO on your Gateway, open Settings and click Import from
          self-hosted OpenSEO.
        </p>
      </Step>
      <Step number={3} title="Paste the code here">
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (codeIsValid) onMove(code);
          }}
        >
          <Label htmlFor="every-app-transfer-code" className="sr-only">
            Transfer code
          </Label>
          <Input
            id="every-app-transfer-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="https://openseo.yourdomain.com#…"
            autoComplete="off"
            spellCheck={false}
            data-ph-mask
          />
          {failure ? (
            <p className="text-sm text-destructive" role="alert">
              {failure}
            </p>
          ) : null}
          <Button type="submit" disabled={!codeIsValid}>
            Move my data
          </Button>
        </form>
      </Step>
    </ol>
  );
}

const PHASE_LABELS: Record<MovePhase, string> = {
  [MovePhase.Data]: "Moving projects and history",
  [MovePhase.Chats]: "Moving SAM chats",
  [MovePhase.Files]: "Moving audit and export files",
};

function MoveProgress({
  state,
}: {
  state: Extract<MoveState, { status: "moving" }>;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-4 text-sm">
        <span className="font-medium">{PHASE_LABELS[state.phase]}</span>
        {state.phase === MovePhase.Files ? (
          <span className="text-muted-foreground tabular-nums">
            {state.done.toLocaleString()} files
          </span>
        ) : null}
      </div>
      <Progress
        value={state.phase === MovePhase.Files ? null : state.done}
        max={Math.max(state.total, 1)}
      />
      <p className="text-sm text-muted-foreground">
        Keep this page open until it finishes.
      </p>
    </div>
  );
}

function MoveDone({ origin }: { origin: string }) {
  return (
    <div className="space-y-3 text-sm">
      <p className="font-medium">Your data is on Every App.</p>
      <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
        <li>
          Everyone connects Google again there for Search Console and Analytics.
        </li>
        <li>
          This install still runs scheduled checks. Turn it off once you're
          happy with the move, or they'll run twice.
        </li>
      </ul>
      <a
        className="inline-block font-medium text-primary underline-offset-4 hover:underline"
        href={origin}
        target="_blank"
        rel="noreferrer"
      >
        Open OpenSEO on your Gateway →
      </a>
    </div>
  );
}
