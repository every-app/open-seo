import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Swords, CheckCircle2, Circle, User } from "lucide-react";
import { toast } from "sonner";
import { getSeoPulseDigest, getSeoWarRoom } from "@/serverFunctions/war-room";

export const Route = createFileRoute("/_app/war-room")({
  component: WarRoomPage,
});

/* ---------- Markdown parsing helpers ---------- */

interface WarRoomTask {
  done: boolean;
  assignee: "RAMON" | "POSEIDON" | null;
  text: string;
}

function toAssignee(value: string | undefined): WarRoomTask["assignee"] {
  const upper = value?.toUpperCase();
  return upper === "RAMON" || upper === "POSEIDON" ? upper : null;
}

interface WarRoomLogEntry {
  raw: string;
}

function parseWarRoomTasks(md: string): WarRoomTask[] {
  const tasks: WarRoomTask[] = [];
  const lines = md.split("\n");
  let inTaskQueue = false;

  for (const line of lines) {
    if (line.startsWith("## 📋 Task Queue")) {
      inTaskQueue = true;
      continue;
    }
    if (line.startsWith("## ") && inTaskQueue) {
      break; // left the task queue section
    }
    if (!inTaskQueue) continue;

    // - [ ] RAMON: ...  or  - [x] POSEIDON: ...  or  - [ ] Some text
    const m = line.match(/^\s*- \[([ x])\]\s+(?:(RAMON|POSEIDON):\s+)?(.+)$/i);
    if (m) {
      tasks.push({
        done: m[1].toLowerCase() === "x",
        assignee: toAssignee(m[2]),
        text: m[3].trim(),
      });
    }
  }
  return tasks;
}

function parseWarRoomLogs(md: string): WarRoomLogEntry[] {
  const entries: WarRoomLogEntry[] = [];
  const lines = md.split("\n");
  let inLog = false;

  for (const line of lines) {
    if (line.startsWith("## 📓 Log")) {
      inLog = true;
      continue;
    }
    if (line.startsWith("## ") && inLog) {
      break;
    }
    if (!inLog) continue;

    if (line.startsWith("- **")) {
      entries.push({ raw: line });
    }
  }
  return entries;
}

function extractPulseBlock(md: string): string | null {
  const startTag = "<!-- PULSE:START";
  const endTag = "<!-- PULSE:END";
  const startIdx = md.indexOf(startTag);
  if (startIdx === -1) return null;
  const endIdx = md.indexOf(endTag, startIdx);
  if (endIdx === -1) return null;

  // Find the ``` after the start comment
  const codeStart = md.indexOf("```", startIdx);
  const codeEnd = md.lastIndexOf("```", endIdx);
  if (codeStart === -1 || codeEnd === -1 || codeEnd <= codeStart) return null;

  return md.slice(codeStart + 3, codeEnd).trim();
}

/* ---------- UI components ---------- */

function AssigneeBadge({ assignee }: { assignee: WarRoomTask["assignee"] }) {
  if (!assignee) return null;
  const isRamon = assignee === "RAMON";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold ${
        isRamon
          ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
          : "bg-primary/15 text-primary"
      }`}
    >
      <User className="size-3" />
      {assignee}
    </span>
  );
}

function TaskRow({ task }: { task: WarRoomTask }) {
  return (
    <div
      className={`flex items-start gap-3 rounded-md px-3 py-2.5 transition-colors ${
        task.done ? "opacity-50" : "hover:bg-base-200/50"
      }`}
    >
      {task.done ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
      ) : (
        <Circle className="mt-0.5 size-4 shrink-0 text-base-content/30" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          {task.assignee && <AssigneeBadge assignee={task.assignee} />}
          <span
            className={`text-sm ${task.done ? "line-through text-base-content/40" : "text-base-content"}`}
          >
            {task.text}
          </span>
        </div>
      </div>
    </div>
  );
}

function LogCard({ entry }: { entry: WarRoomLogEntry }) {
  // Strip leading "- **" and trailing "**" for display, keep it simple
  const text = entry.raw.replace(/^\s*-\s*\*\*/, "").replace(/\*\*\s*—?/, " — ");
  return (
    <div className="rounded-lg border-l-4 border-primary/40 bg-base-200/40 px-4 py-3 text-sm text-base-content/80">
      {text}
    </div>
  );
}

/* ---------- Main page ---------- */

function WarRoomPage() {
  const queryClient = useQueryClient();

  const pulseQuery = useQuery({
    queryKey: ["seoPulseDigest"],
    queryFn: () => getSeoPulseDigest(),
    staleTime: 60_000,
  });

  const warRoomQuery = useQuery({
    queryKey: ["seoWarRoom"],
    queryFn: () => getSeoWarRoom(),
    staleTime: 60_000,
  });

  const warRoomMd = warRoomQuery.data ?? "";
  const tasks = parseWarRoomTasks(warRoomMd);
  const logs = parseWarRoomLogs(warRoomMd).slice(0, 3);
  const pulseText = pulseQuery.data
    ? extractPulseBlock(pulseQuery.data) ?? pulseQuery.data
    : null;

  const openTasks = tasks.filter((t) => !t.done);
  const doneTasks = tasks.filter((t) => t.done);

  const handleRefresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["seoPulseDigest"] });
    void queryClient.invalidateQueries({ queryKey: ["seoWarRoom"] });
    toast.success("War Room refreshed");
  };

  return (
    <div className="h-full overflow-auto bg-base-100 px-4 py-8 pb-24 md:px-6 md:py-12 md:pb-8">
      <div className="mx-auto max-w-3xl space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Swords className="size-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">SEO War Room</h1>
              <p className="text-sm text-base-content/50">
                Shared workboard — Ramon + Poseidon
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-ghost gap-2"
            onClick={handleRefresh}
            disabled={pulseQuery.isFetching || warRoomQuery.isFetching}
          >
            <RefreshCw
              className={`size-4 ${
                pulseQuery.isFetching || warRoomQuery.isFetching
                  ? "animate-spin"
                  : ""
              }`}
            />
            Refresh
          </button>
        </div>

        {/* Latest Pulse */}
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-medium text-base-content/50">
            <span className="text-base">📊</span> Latest Daily Pulse
          </h2>
          {pulseText ? (
            <pre className="overflow-x-auto rounded-lg bg-base-200 p-4 text-sm font-mono whitespace-pre-wrap text-base-content/80">
              {pulseText}
            </pre>
          ) : (
            <div className="rounded-lg border border-base-300 bg-base-200/30 px-4 py-8 text-center text-sm text-base-content/40">
              {pulseQuery.isLoading
                ? "Loading pulse…"
                : "No pulse data yet. The daily pulse runs at 7:45 AM ET."}
            </div>
          )}
        </section>

        {/* Task Queue */}
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-medium text-base-content/50">
            <span className="text-base">📋</span> Task Queue
            <span className="text-base-content/30">
              ({openTasks.length} open, {doneTasks.length} done)
            </span>
          </h2>
          {tasks.length === 0 ? (
            <div className="rounded-lg border border-base-300 bg-base-200/30 px-4 py-8 text-center text-sm text-base-content/40">
              {warRoomQuery.isLoading ? "Loading tasks…" : "No tasks found."}
            </div>
          ) : (
            <div className="space-y-1 rounded-lg border border-base-300 bg-base-100 p-2">
              {openTasks.map((task, i) => (
                <TaskRow key={`open-${i}`} task={task} />
              ))}
              {doneTasks.length > 0 && (
                <>
                  <div className="my-2 border-t border-base-300" />
                  {doneTasks.map((task, i) => (
                    <TaskRow key={`done-${i}`} task={task} />
                  ))}
                </>
              )}
            </div>
          )}
        </section>

        {/* Recent Log */}
        {logs.length > 0 && (
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-medium text-base-content/50">
              <span className="text-base">📓</span> Recent Log
            </h2>
            <div className="space-y-2">
              {logs.map((entry, i) => (
                <LogCard key={i} entry={entry} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}