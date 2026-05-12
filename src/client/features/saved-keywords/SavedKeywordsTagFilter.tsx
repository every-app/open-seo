import {
  Check,
  ChevronDown,
  MoreHorizontal,
  Search,
  Tag as TagIcon,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  resolveTagColor,
  tagDotClass,
  type TagColorKey,
} from "@/shared/tag-colors";
import type { SavedKeywordTagSummary } from "@/types/keywords";
import { ManageTagRow } from "./ManageTagRow";
import { TagChip } from "./TagChip";

export function SavedKeywordsTagFilter({
  availableTags,
  selectedTagIds,
  onToggleTagFilter,
  onClearSelection,
  onUpdateTag,
  onDeleteTag,
  busyTagIds,
}: {
  availableTags: SavedKeywordTagSummary[];
  selectedTagIds: string[];
  onToggleTagFilter: (tagId: string) => void;
  onClearSelection: () => void;
  onUpdateTag: (input: {
    tagId: string;
    name?: string;
    color?: TagColorKey | null;
  }) => void;
  onDeleteTag: (tagId: string) => void;
  busyTagIds: Set<string>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [managingTagId, setManagingTagId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        containerRef.current &&
        containerRef.current.contains(target)
      ) {
        return;
      }
      setOpen(false);
      setManagingTagId(null);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setManagingTagId(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const filteredTags = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    if (!q) return availableTags;
    return availableTags.filter((tag) => tag.normalizedName.includes(q));
  }, [availableTags, query]);

  const selectedTags = availableTags.filter((tag) =>
    selectedTagIds.includes(tag.id),
  );
  const hasSelection = selectedTagIds.length > 0;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm transition ${
          hasSelection
            ? "border-primary/50 bg-primary/10 text-base-content"
            : "border-base-300 bg-base-100 hover:border-base-content/30"
        }`}
        onClick={() => setOpen((v) => !v)}
      >
        <TagIcon className="size-3.5 opacity-70" />
        <span className="font-medium">Tags</span>
        {hasSelection ? (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-content">
            {selectedTags.length}
          </span>
        ) : null}
        <ChevronDown className="size-3.5 opacity-60" />
      </button>

      {selectedTags.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {selectedTags.map((tag) => (
            <TagChip
              key={tag.id}
              tag={tag}
              size="sm"
              selected
              onClick={() => onToggleTagFilter(tag.id)}
              trailing={<X className="size-3 opacity-70" />}
              title="Remove filter"
            />
          ))}
          <button
            type="button"
            className="text-xs text-base-content/60 underline-offset-2 hover:text-base-content hover:underline"
            onClick={onClearSelection}
          >
            Clear
          </button>
        </div>
      ) : null}

      {open ? (
        <TagFilterPopover
          availableTags={availableTags}
          filteredTags={filteredTags}
          selectedTagIds={selectedTagIds}
          query={query}
          managingTagId={managingTagId}
          busyTagIds={busyTagIds}
          onQueryChange={setQuery}
          onToggleTagFilter={onToggleTagFilter}
          onStartManaging={setManagingTagId}
          onUpdateTag={(tagId, input) => {
            onUpdateTag({ tagId, ...input });
            setManagingTagId(null);
          }}
          onDeleteTag={(tagId) => {
            onDeleteTag(tagId);
            setManagingTagId(null);
          }}
          onClearSelection={onClearSelection}
        />
      ) : null}
    </div>
  );
}

function TagFilterPopover({
  availableTags,
  filteredTags,
  selectedTagIds,
  query,
  managingTagId,
  busyTagIds,
  onQueryChange,
  onToggleTagFilter,
  onStartManaging,
  onUpdateTag,
  onDeleteTag,
  onClearSelection,
}: {
  availableTags: SavedKeywordTagSummary[];
  filteredTags: SavedKeywordTagSummary[];
  selectedTagIds: string[];
  query: string;
  managingTagId: string | null;
  busyTagIds: Set<string>;
  onQueryChange: (value: string) => void;
  onToggleTagFilter: (tagId: string) => void;
  onStartManaging: (tagId: string | null) => void;
  onUpdateTag: (
    tagId: string,
    input: { name?: string; color?: TagColorKey | null },
  ) => void;
  onDeleteTag: (tagId: string) => void;
  onClearSelection: () => void;
}) {
  return (
    <div className="absolute right-0 top-full z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-base-300 bg-base-100 shadow-2xl">
      <div className="border-b border-base-300 p-2">
        <label className="flex items-center gap-2 rounded-md border border-base-300 bg-base-200/50 px-2 py-1.5">
          <Search className="size-3.5 opacity-50" />
          <input
            autoFocus
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search tags…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-base-content/40"
          />
          {query ? (
            <button
              type="button"
              className="text-base-content/40 hover:text-base-content"
              onClick={() => onQueryChange("")}
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </label>
      </div>

      <div className="max-h-72 overflow-y-auto py-1">
        {filteredTags.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-base-content/55">
            {availableTags.length === 0
              ? "No tags yet. Add tags from a selection of keywords."
              : "No tags match that search."}
          </div>
        ) : null}

        {filteredTags.map((tag) => (
          <TagFilterRow
            key={tag.id}
            tag={tag}
            checked={selectedTagIds.includes(tag.id)}
            isManaging={managingTagId === tag.id}
            isBusy={busyTagIds.has(tag.id)}
            onToggle={() => onToggleTagFilter(tag.id)}
            onStartManaging={onStartManaging}
            onUpdate={(input) => onUpdateTag(tag.id, input)}
            onDelete={() => onDeleteTag(tag.id)}
          />
        ))}
      </div>

      {selectedTagIds.length > 0 ? (
        <div className="flex items-center justify-between border-t border-base-300 px-2 py-1.5 text-xs">
          <span className="text-base-content/55">
            {selectedTagIds.length} selected
          </span>
          <button
            type="button"
            className="rounded px-2 py-1 text-base-content/70 hover:bg-base-200"
            onClick={onClearSelection}
          >
            Clear all
          </button>
        </div>
      ) : null}
    </div>
  );
}

function TagFilterRow({
  tag,
  checked,
  isManaging,
  isBusy,
  onToggle,
  onStartManaging,
  onUpdate,
  onDelete,
}: {
  tag: SavedKeywordTagSummary;
  checked: boolean;
  isManaging: boolean;
  isBusy: boolean;
  onToggle: () => void;
  onStartManaging: (tagId: string | null) => void;
  onUpdate: (input: { name?: string; color?: TagColorKey | null }) => void;
  onDelete: () => void;
}) {
  const color = resolveTagColor(tag);
  return (
    <div>
      <div className="group flex items-center gap-2 px-2 py-1.5 hover:bg-base-200">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={onToggle}
        >
          <span
            className={`flex size-4 shrink-0 items-center justify-center rounded border ${
              checked
                ? "border-primary bg-primary text-primary-content"
                : "border-base-300"
            }`}
          >
            {checked ? <Check className="size-3" /> : null}
          </span>
          <span
            className={`size-2 shrink-0 rounded-full ${tagDotClass(color)}`}
          />
          <span className="min-w-0 flex-1 truncate text-sm">{tag.name}</span>
          <span className="shrink-0 text-[11px] tabular-nums text-base-content/45">
            {tag.keywordCount}
          </span>
        </button>
        <button
          type="button"
          className={`rounded p-1 text-base-content/45 hover:bg-base-300 hover:text-base-content ${
            isManaging ? "bg-base-300 text-base-content" : ""
          }`}
          onClick={() => onStartManaging(isManaging ? null : tag.id)}
          aria-label={`Manage ${tag.name}`}
        >
          <MoreHorizontal className="size-3.5" />
        </button>
      </div>

      {isManaging ? (
        <ManageTagRow
          tag={tag}
          isBusy={isBusy}
          onSave={onUpdate}
          onDelete={onDelete}
          onCancel={() => onStartManaging(null)}
        />
      ) : null}
    </div>
  );
}
