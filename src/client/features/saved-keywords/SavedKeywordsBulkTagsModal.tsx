import { Check, Loader2, Plus, Search, X } from "@/client/components/icons";
import { useMemo, useRef, useState } from "react";
import { Modal } from "@/client/components/Modal";
import { resolveTagColor, tagDotClass } from "@/shared/tag-colors";
import type { SavedKeywordTag, SavedKeywordTagSummary } from "@/types/keywords";
import { TagChip } from "./TagChip";

import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Checkbox } from "@/client/components/ui/checkbox";
import { Input } from "@/client/components/ui/input";
import { InputGroup } from "@/client/components/ui/input-group";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/client/components/ui/toggle-group";

type Mode = "add" | "remove";

export function SavedKeywordsBulkTagsModal({
  availableTags,
  selectedCount,
  selectedRowTags,
  isPending,
  onClose,
  onApply,
}: {
  availableTags: SavedKeywordTagSummary[];
  selectedCount: number;
  /** Tags currently attached to the selected rows (deduped). Used to show
   *  initial state and to compute which existing tags can be removed. */
  selectedRowTags: SavedKeywordTag[];
  isPending: boolean;
  onClose: () => void;
  onApply: (input: { addTags?: string[]; removeTagIds?: string[] }) => void;
}) {
  const [mode, setMode] = useState<Mode>("add");
  const [query, setQuery] = useState("");
  const [addNames, setAddNames] = useState<string[]>([]);
  const [removeIds, setRemoveIds] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const normalizedAddSet = useMemo(
    () => new Set(addNames.map((name) => name.toLocaleLowerCase())),
    [addNames],
  );

  const availableByNormalized = useMemo(() => {
    const map = new Map<string, SavedKeywordTagSummary>();
    for (const tag of availableTags) {
      map.set(tag.normalizedName, tag);
    }
    return map;
  }, [availableTags]);

  const filteredAvailable = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    if (!q) return availableTags;
    return availableTags.filter((tag) => tag.normalizedName.includes(q));
  }, [availableTags, query]);

  const trimmedQuery = query.trim();
  const queryNormalized = trimmedQuery.toLocaleLowerCase();
  const showCreate =
    mode === "add" &&
    trimmedQuery.length > 0 &&
    !availableByNormalized.has(queryNormalized) &&
    !normalizedAddSet.has(queryNormalized);

  const canApply = !isPending && (addNames.length > 0 || removeIds.length > 0);

  const handleToggleAdd = (tag: SavedKeywordTagSummary) => {
    setAddNames((current) =>
      normalizedAddSet.has(tag.normalizedName)
        ? current.filter(
            (name) => name.toLocaleLowerCase() !== tag.normalizedName,
          )
        : [...current, tag.name],
    );
    setRemoveIds((current) => current.filter((id) => id !== tag.id));
  };

  const handleCreate = () => {
    if (!trimmedQuery) return;
    setAddNames((current) =>
      current.some((name) => name.toLocaleLowerCase() === queryNormalized)
        ? current
        : [...current, trimmedQuery],
    );
    setQuery("");
    inputRef.current?.focus();
  };

  const handleToggleRemove = (tag: SavedKeywordTag) => {
    setRemoveIds((current) =>
      current.includes(tag.id)
        ? current.filter((id) => id !== tag.id)
        : [...current, tag.id],
    );
    setAddNames((current) =>
      current.filter((name) => name.toLocaleLowerCase() !== tag.normalizedName),
    );
  };

  return (
    <Modal maxWidth="max-w-lg" onClose={onClose} labelledBy="bulk-tags-title">
      <div className="space-y-4">
        <div>
          <h3 id="bulk-tags-title" className="text-lg font-semibold">
            Update tags
          </h3>
          <p className="text-sm text-muted-foreground">
            Apply or remove tags across {selectedCount} selected keyword
            {selectedCount !== 1 ? "s" : ""}.
          </p>
        </div>

        <ToggleGroup
          size="sm"
          value={[mode]}
          onValueChange={(value) => {
            const next = value[0];
            if (next === "add" || next === "remove") setMode(next);
          }}
        >
          <ToggleGroupItem value="add" className="gap-1.5">
            Add tags
            {addNames.length > 0 ? (
              <Badge variant="primary">{addNames.length}</Badge>
            ) : null}
          </ToggleGroupItem>
          <ToggleGroupItem
            value="remove"
            className="gap-1.5"
            disabled={selectedRowTags.length === 0}
          >
            Remove tags
            {removeIds.length > 0 ? (
              <Badge variant="primary">{removeIds.length}</Badge>
            ) : null}
          </ToggleGroupItem>
        </ToggleGroup>

        {mode === "add" ? (
          <div className="space-y-2">
            {addNames.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-2">
                {addNames.map((name) => {
                  const existing = availableByNormalized.get(
                    name.toLocaleLowerCase(),
                  );
                  const tag = existing ?? {
                    id: `new:${name}`,
                    name,
                    normalizedName: name.toLocaleLowerCase(),
                    color: null,
                  };
                  return (
                    <TagChip
                      key={name}
                      tag={tag}
                      size="sm"
                      onClick={() =>
                        setAddNames((current) =>
                          current.filter(
                            (existingName) => existingName !== name,
                          ),
                        )
                      }
                      trailing={<X className="size-3 opacity-70" />}
                      title="Remove from selection"
                    />
                  );
                })}
              </div>
            ) : null}

            <InputGroup prefix={<Search className="size-3.5" />}>
              <Input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && showCreate) {
                    event.preventDefault();
                    handleCreate();
                  }
                }}
                placeholder="Search or create…"
              />
            </InputGroup>

            <div className="max-h-56 overflow-y-auto rounded-md border border-border">
              {showCreate ? (
                <Button
                  variant="ghost"
                  onClick={handleCreate}
                  className="h-auto w-full justify-start gap-2 whitespace-normal rounded-none px-3 py-2 text-left text-sm font-normal text-inherit"
                >
                  <Plus className="size-3.5 text-link" />
                  <span className="text-muted-foreground">Create</span>
                  <span className="font-medium">
                    &ldquo;{trimmedQuery}&rdquo;
                  </span>
                </Button>
              ) : null}

              {filteredAvailable.length === 0 && !showCreate ? (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                  {availableTags.length === 0
                    ? "No tags yet. Type a name above to create one."
                    : "No tags match that search."}
                </div>
              ) : null}

              {filteredAvailable.map((tag) => {
                const checked = normalizedAddSet.has(tag.normalizedName);
                const color = resolveTagColor(tag);
                return (
                  <label
                    key={tag.id}
                    className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 transition-colors hover:bg-accent"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => handleToggleAdd(tag)}
                    />
                    <span
                      className={`size-2 shrink-0 rounded-full ${tagDotClass(color)}`}
                    />
                    <span className="flex-1 truncate text-sm">{tag.name}</span>
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {tag.keywordCount}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {selectedRowTags.length === 0 ? (
              <div className="rounded-md border border-border bg-muted/40 px-3 py-6 text-center text-xs text-muted-foreground">
                The selected keywords don&apos;t have any tags to remove.
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5 rounded-md border border-border p-3">
                {selectedRowTags.map((tag) => {
                  const checked = removeIds.includes(tag.id);
                  return (
                    <TagChip
                      key={tag.id}
                      tag={tag}
                      size="sm"
                      onClick={() => handleToggleRemove(tag)}
                      selected={checked}
                      trailing={checked ? <Check className="size-3" /> : null}
                      title={checked ? "Will be removed" : "Click to remove"}
                    />
                  );
                })}
              </div>
            )}
            {removeIds.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                {removeIds.length} tag{removeIds.length !== 1 ? "s" : ""} will
                be detached from the selected keywords.
              </p>
            ) : null}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            disabled={!canApply}
            onClick={() =>
              onApply({
                addTags: addNames.length > 0 ? addNames : undefined,
                removeTagIds: removeIds.length > 0 ? removeIds : undefined,
              })
            }
          >
            {isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Apply
          </Button>
        </div>
      </div>
    </Modal>
  );
}
