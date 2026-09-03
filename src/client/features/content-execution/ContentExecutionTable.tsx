import { ExternalLink } from "lucide-react";
import type {
  ContentExecutionItem,
  ContentExecutionStatus,
} from "@/types/content-execution";
import {
  CONTENT_EXECUTION_STATUSES,
  parseContentExecutionStatus,
} from "@/types/content-execution";
import {
  getContentExecutionStatusLabel,
  getJiraIssueLabel,
} from "./content-execution-ui";

type ExecutionUpdate = {
  status?: ContentExecutionStatus;
  owner?: string | null;
  dueDate?: string | null;
};

type CellProps = {
  item: ContentExecutionItem;
  isPending: boolean;
  onUpdate: (id: string, update: ExecutionUpdate) => void;
};

function optionalInputValue(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function PageCell({ item }: { item: ContentExecutionItem }) {
  return (
    <td className="min-w-72">
      <p className="font-medium">{item.title}</p>
      <p className="mt-1 text-xs text-base-content/55">
        Primary: {item.primaryKeyword || "Not set"} · {item.keywordCount}{" "}
        keyword
        {item.keywordCount === 1 ? "" : "s"}
      </p>
      {item.targetUrl ? (
        <a
          href={item.targetUrl}
          target="_blank"
          rel="noreferrer"
          className="link link-hover mt-1 inline-flex max-w-72 items-center gap-1 truncate text-xs"
        >
          {item.targetUrl}
          <ExternalLink className="size-3 shrink-0" />
        </a>
      ) : null}
    </td>
  );
}

function StatusCell({ item, isPending, onUpdate }: CellProps) {
  return (
    <td className="min-w-44">
      <label className="sr-only" htmlFor={`status-${item.id}`}>
        Status for {item.title}
      </label>
      <select
        id={`status-${item.id}`}
        value={item.status}
        disabled={isPending}
        onChange={(event) =>
          onUpdate(item.id, {
            status: parseContentExecutionStatus(event.target.value),
          })
        }
        className="select select-bordered min-h-11 w-full"
      >
        {CONTENT_EXECUTION_STATUSES.map((status) => (
          <option key={status} value={status}>
            {getContentExecutionStatusLabel(status)}
          </option>
        ))}
      </select>
    </td>
  );
}

function OwnerCell({ item, isPending, onUpdate }: CellProps) {
  return (
    <td className="min-w-40">
      <label className="sr-only" htmlFor={`owner-${item.id}`}>
        Owner for {item.title}
      </label>
      <input
        id={`owner-${item.id}`}
        defaultValue={item.owner ?? ""}
        disabled={isPending}
        placeholder="Unassigned"
        className="input input-bordered min-h-11 w-full"
        onBlur={(event) => {
          const owner = optionalInputValue(event.target.value);
          if (owner !== item.owner) onUpdate(item.id, { owner });
        }}
      />
    </td>
  );
}

function DueDateCell({ item, isPending, onUpdate }: CellProps) {
  return (
    <td className="min-w-40">
      <label className="sr-only" htmlFor={`due-${item.id}`}>
        Due date for {item.title}
      </label>
      <input
        id={`due-${item.id}`}
        type="date"
        defaultValue={item.dueDate ?? ""}
        disabled={isPending}
        className="input input-bordered min-h-11 w-full"
        onBlur={(event) => {
          const dueDate = optionalInputValue(event.target.value);
          if (dueDate !== item.dueDate) onUpdate(item.id, { dueDate });
        }}
      />
    </td>
  );
}

function JiraCell({ item }: { item: ContentExecutionItem }) {
  return (
    <td className="min-w-32">
      {item.jiraIssueUrl ? (
        <a
          href={item.jiraIssueUrl}
          target="_blank"
          rel="noreferrer"
          className="btn btn-ghost min-h-11 gap-1"
        >
          {getJiraIssueLabel(item.jiraIssueKey)}
          <ExternalLink className="size-3" />
        </a>
      ) : (
        <span className="text-xs text-base-content/45">Not linked</span>
      )}
    </td>
  );
}

function ExecutionRow(props: CellProps) {
  return (
    <tr id={`item-${props.item.id}`} className="align-top">
      <PageCell item={props.item} />
      <StatusCell {...props} />
      <OwnerCell {...props} />
      <DueDateCell {...props} />
      <JiraCell item={props.item} />
    </tr>
  );
}

export function ContentExecutionTable({
  items,
  pendingItemId,
  onUpdate,
}: {
  items: ContentExecutionItem[];
  pendingItemId: string | null;
  onUpdate: (id: string, update: ExecutionUpdate) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th>Page or article</th>
            <th>Status</th>
            <th>Owner</th>
            <th>Due date</th>
            <th>Jira</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <ExecutionRow
              key={item.id}
              item={item}
              isPending={pendingItemId === item.id}
              onUpdate={onUpdate}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
