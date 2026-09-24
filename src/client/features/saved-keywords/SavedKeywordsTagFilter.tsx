import {
  Check,
  ChevronDown,
  MoreHorizontal,
  Search,
  Tag as TagIcon,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  resolveTagColor,
  tagDotClass,
  type TagColorKey,
} from "@/shared/tag-colors";
import type { SavedKeywordTagSummary } from "@/types/keywords";
import { ManageTagRow } from "./ManageTagRow";
import { TagChip } from "./TagChip";

import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/client/components/ui/input-group";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/client/components/ui/popover";
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
    <div>
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) setManagingTagId(null);
        }}
      >
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              className={`gap-2 rounded-md px-3 ${
                hasSelection ? "border-primary/50 bg-primary/10" : ""
              }`}
            />
          }
        >
          <TagIcon className="size-3.5 opacity-70" />
          <span className="font-medium">Tags</span>
          {hasSelection ? (
            <Badge variant="primary" className="px-1.5 py-0 text-[11px]">
              {selectedTags.length}
            </Badge>
          ) : null}
          <ChevronDown className="size-3.5 opacity-60" />
        </PopoverTrigger>

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
            <Button
              variant="link"
              className="h-auto p-0 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              onClick={onClearSelection}
            >
              Clear
            </Button>
          </div>
        ) : null}

        <PopoverContent
          align="end"
          className="w-80 max-w-[calc(100vw-2rem)] p-0"
        >
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
        </PopoverContent>
      </Popover>
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
    <div className="overflow-hidden">
      <div className="border-b border-border p-2">
        <InputGroup>
          <InputGroupAddon className="border-r-0 bg-transparent pr-0">
            <Search className="size-3.5" />
          </InputGroupAddon>
          <InputGroupInput
            autoFocus
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search tags…"
            aria-label="Search tags"
          />
          {query ? (
            <Button
              variant="ghost"
              className="h-auto rounded-md px-0 hover:bg-transparent text-muted-foreground/70 hover:text-foreground"
              onClick={() => onQueryChange("")}
            >
              <X className="size-3.5" />
            </Button>
          ) : null}
        </InputGroup>
      </div>

      <div className="max-h-72 overflow-y-auto py-1">
        {filteredTags.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
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
        <div className="flex items-center justify-between border-t border-border px-2 py-1.5 text-xs">
          <span className="text-muted-foreground">
            {selectedTagIds.length} selected
          </span>
          <Button
            variant="ghost"
            className="h-auto rounded px-2 py-1 text-muted-foreground hover:bg-muted"
            onClick={onClearSelection}
          >
            Clear all
          </Button>
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
      <div className="group flex items-center gap-2 px-2 py-1.5 hover:bg-muted">
        <Button
          variant="ghost"
          className="h-auto rounded-md justify-start whitespace-normal text-left font-normal text-inherit px-0 flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={onToggle}
        >
          <span
            className={`flex size-4 shrink-0 items-center justify-center rounded border ${
              checked
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border"
            }`}
          >
            {checked ? <Check className="size-3" /> : null}
          </span>
          <span
            className={`size-2 shrink-0 rounded-full ${tagDotClass(color)}`}
          />
          <span className="min-w-0 flex-1 truncate text-sm">{tag.name}</span>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/70">
            {tag.keywordCount}
          </span>
        </Button>
        <Button
          variant="ghost"
          className={`h-auto rounded p-1 text-muted-foreground/70 hover:bg-border hover:text-foreground ${
            isManaging ? "bg-border text-foreground" : ""
          }`}
          onClick={() => onStartManaging(isManaging ? null : tag.id)}
          aria-label={`Manage ${tag.name}`}
        >
          <MoreHorizontal className="size-3.5" />
        </Button>
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
