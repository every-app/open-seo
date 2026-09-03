import { Loader2 } from "lucide-react";
import {
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import { Modal } from "@/client/components/Modal";
import type { SavedKeywordRow } from "@/types/keywords";
import type { CreateContentExecutionItemInput } from "@/types/schemas/content-execution";

type CreateValues = Omit<CreateContentExecutionItemInput, "projectId">;
type TextSetter = Dispatch<SetStateAction<string>>;

function optionalValue(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function useCreateExecutionForm(selectedRows: SavedKeywordRow[]) {
  const [title, setTitle] = useState(
    selectedRows[0] ? `${selectedRows[0].keyword} page` : "",
  );
  const [primaryId, setPrimaryId] = useState(selectedRows[0]?.id ?? "");
  const [targetUrl, setTargetUrl] = useState("");
  const [owner, setOwner] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [jiraIssueKey, setJiraIssueKey] = useState("");
  const [jiraIssueUrl, setJiraIssueUrl] = useState("");
  const values = (): CreateValues => ({
    title: title.trim(),
    targetUrl: optionalValue(targetUrl),
    savedKeywordIds: selectedRows.map((row) => row.id),
    primarySavedKeywordId: primaryId,
    owner: optionalValue(owner),
    dueDate: optionalValue(dueDate),
    jiraIssueKey: optionalValue(jiraIssueKey),
    jiraIssueUrl: optionalValue(jiraIssueUrl),
  });
  return {
    title,
    setTitle,
    primaryId,
    setPrimaryId,
    targetUrl,
    setTargetUrl,
    owner,
    setOwner,
    dueDate,
    setDueDate,
    jiraIssueKey,
    setJiraIssueKey,
    jiraIssueUrl,
    setJiraIssueUrl,
    values,
  };
}

function PageFields({
  selectedRows,
  title,
  setTitle,
  primaryId,
  setPrimaryId,
  targetUrl,
  setTargetUrl,
}: {
  selectedRows: SavedKeywordRow[];
  title: string;
  setTitle: TextSetter;
  primaryId: string;
  setPrimaryId: TextSetter;
  targetUrl: string;
  setTargetUrl: TextSetter;
}) {
  return (
    <>
      <label className="form-control md:col-span-2">
        <span className="label-text mb-1 text-sm font-medium">
          Page or article
        </span>
        <input
          required
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="input input-bordered w-full"
          placeholder="Meta Conversions API solution page"
        />
      </label>
      <label className="form-control">
        <span className="label-text mb-1 text-sm font-medium">
          Primary keyword
        </span>
        <select
          required
          value={primaryId}
          onChange={(event) => setPrimaryId(event.target.value)}
          className="select select-bordered w-full"
        >
          {selectedRows.map((row) => (
            <option key={row.id} value={row.id}>
              {row.keyword}
            </option>
          ))}
        </select>
      </label>
      <label className="form-control md:col-span-2">
        <span className="label-text mb-1 text-sm font-medium">Target URL</span>
        <input
          type="url"
          value={targetUrl}
          onChange={(event) => setTargetUrl(event.target.value)}
          className="input input-bordered w-full"
          placeholder="https://www.customerlabs.com/..."
        />
      </label>
    </>
  );
}

function DeliveryFields({
  owner,
  setOwner,
  dueDate,
  setDueDate,
}: {
  owner: string;
  setOwner: TextSetter;
  dueDate: string;
  setDueDate: TextSetter;
}) {
  return (
    <>
      <label className="form-control">
        <span className="label-text mb-1 text-sm font-medium">Owner</span>
        <input
          value={owner}
          onChange={(event) => setOwner(event.target.value)}
          className="input input-bordered w-full"
          placeholder="Unassigned"
        />
      </label>
      <label className="form-control">
        <span className="label-text mb-1 text-sm font-medium">Due date</span>
        <input
          type="date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
          className="input input-bordered w-full"
        />
      </label>
    </>
  );
}

function JiraFields({
  issueKey,
  setIssueKey,
  issueUrl,
  setIssueUrl,
}: {
  issueKey: string;
  setIssueKey: TextSetter;
  issueUrl: string;
  setIssueUrl: TextSetter;
}) {
  return (
    <>
      <label className="form-control">
        <span className="label-text mb-1 text-sm font-medium">
          Jira issue key
        </span>
        <input
          value={issueKey}
          onChange={(event) => setIssueKey(event.target.value)}
          className="input input-bordered w-full uppercase"
          placeholder="SEO-101"
        />
      </label>
      <label className="form-control md:col-span-2">
        <span className="label-text mb-1 text-sm font-medium">
          Jira issue URL
        </span>
        <input
          type="url"
          value={issueUrl}
          onChange={(event) => setIssueUrl(event.target.value)}
          className="input input-bordered w-full"
          placeholder="https://customerlabs.atlassian.net/browse/SEO-101"
        />
      </label>
    </>
  );
}

export function CreateExecutionItemModal({
  selectedRows,
  isPending,
  onClose,
  onCreate,
}: {
  selectedRows: SavedKeywordRow[];
  isPending: boolean;
  onClose: () => void;
  onCreate: (values: CreateValues) => void;
}) {
  const form = useCreateExecutionForm(selectedRows);
  const assignedCount = selectedRows.filter((row) => row.executionItem).length;
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.title.trim() || !form.primaryId || assignedCount > 0) return;
    onCreate(form.values());
  };
  return (
    <Modal
      maxWidth="max-w-2xl"
      onClose={isPending ? undefined : onClose}
      labelledBy="create-execution-item-title"
    >
      <div>
        <h2 id="create-execution-item-title" className="text-lg font-semibold">
          Create one work item
        </h2>
        <p className="mt-1 text-sm text-base-content/65">
          Group these {selectedRows.length} keyword variants under one page.
        </p>
      </div>
      {assignedCount > 0 ? (
        <div role="alert" className="alert alert-warning text-sm">
          {assignedCount} selected keyword
          {assignedCount === 1 ? " is" : "s are"}
          already assigned. Close this window and unselect them first.
        </div>
      ) : null}
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid gap-4 md:grid-cols-2">
          <PageFields selectedRows={selectedRows} {...form} />
          <DeliveryFields {...form} />
          <JiraFields
            issueKey={form.jiraIssueKey}
            setIssueKey={form.setJiraIssueKey}
            issueUrl={form.jiraIssueUrl}
            setIssueUrl={form.setJiraIssueUrl}
          />
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            disabled={isPending}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary gap-2"
            disabled={isPending || assignedCount > 0 || !form.title.trim()}
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Create work item
          </button>
        </div>
      </form>
    </Modal>
  );
}
