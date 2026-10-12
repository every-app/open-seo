import { Check, Plus, Search, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Checkbox } from "@/client/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/client/components/ui/input-group";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/client/components/ui/toggle-group";
import type { SavedKeywordTag, SavedKeywordTagSummary } from "@/types/keywords";
import { TagChip, TagDot } from "./TagChip";

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
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Update tags</DialogTitle>
          <DialogDescription>
            Apply or remove tags across {selectedCount} selected keyword
            {selectedCount !== 1 ? "s" : ""}.
          </DialogDescription>
        </DialogHeader>

        <ToggleGroup
          size="sm"
          spacing={0.5}
          value={[mode]}
          onValueChange={(next) => {
            // A press on the active item empties the group. Keep one mode on.
            if (next[0] === "add" || next[0] === "remove") setMode(next[0]);
          }}
          className="rounded-lg bg-muted p-0.5 ring-1 ring-border ring-inset"
        >
          <SegmentItem value="add" label="Add tags" count={addNames.length} />
          <SegmentItem
            value="remove"
            label="Remove tags"
            count={removeIds.length}
            disabled={selectedRowTags.length === 0}
          />
        </ToggleGroup>

        {mode === "add" ? (
          <div className="space-y-2">
            {addNames.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-muted/40 p-2">
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

            <InputGroup>
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                ref={inputRef}
                aria-label="Search or create a tag"
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

            <div className="max-h-56 overflow-y-auto rounded-lg border border-border py-1">
              {showCreate ? (
                <Button
                  variant="ghost"
                  className="w-full justify-start rounded-none font-normal"
                  onClick={handleCreate}
                >
                  <Plus data-icon="inline-start" className="text-primary" />
                  <span className="text-muted-foreground">Create</span>
                  <span className="font-medium">
                    &ldquo;{trimmedQuery}&rdquo;
                  </span>
                </Button>
              ) : null}

              {filteredAvailable.length === 0 && !showCreate ? (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                  {availableTags.length === 0
                    ? "No tags yet. Type a name above to create one."
                    : "No tags match that search."}
                </p>
              ) : null}

              {filteredAvailable.map((tag) => (
                <label
                  key={tag.id}
                  className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted"
                >
                  <Checkbox
                    checked={normalizedAddSet.has(tag.normalizedName)}
                    onCheckedChange={() => handleToggleAdd(tag)}
                  />
                  <TagDot tag={tag} />
                  <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {tag.keywordCount}
                  </span>
                </label>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5 rounded-lg border border-border p-3">
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
            {removeIds.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                {removeIds.length} tag{removeIds.length !== 1 ? "s" : ""} will
                be detached from the selected keywords.
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            pending={isPending}
            disabled={!canApply}
            onClick={() =>
              onApply({
                addTags: addNames.length > 0 ? addNames : undefined,
                removeTagIds: removeIds.length > 0 ? removeIds : undefined,
              })
            }
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SegmentItem({
  value,
  label,
  count,
  disabled,
}: {
  value: Mode;
  label: string;
  count: number;
  disabled?: boolean;
}) {
  return (
    <ToggleGroupItem
      value={value}
      disabled={disabled}
      className="h-6 text-muted-foreground aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm"
    >
      {label}
      {count > 0 ? <Badge size="sm">{count}</Badge> : null}
    </ToggleGroupItem>
  );
}
