import { Pencil, Trash2 } from "@/client/components/icons";
import { useState } from "react";
import {
  resolveTagColor,
  TAG_COLOR_KEYS,
  tagSwatchClass,
  type TagColorKey,
} from "@/shared/tag-colors";
import type { SavedKeywordTagSummary } from "@/types/keywords";

import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { cn } from "@/client/lib/utils";

export function ManageTagRow({
  tag,
  isBusy,
  onSave,
  onDelete,
  onCancel,
}: {
  tag: SavedKeywordTagSummary;
  isBusy: boolean;
  onSave: (input: { name?: string; color?: TagColorKey | null }) => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(tag.name);
  const currentColor = resolveTagColor(tag);
  const [color, setColor] = useState<TagColorKey>(currentColor);
  const nameChanged = name.trim() !== tag.name && name.trim().length > 0;
  const colorChanged = color !== currentColor;
  const canSave = (nameChanged || colorChanged) && !isBusy;

  return (
    <div className="space-y-2 border-y border-border bg-muted/40 px-3 py-2.5">
      <div className="space-y-1">
        <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Rename
        </label>
        <div className="flex items-center gap-1.5">
          <Pencil className="size-3 opacity-50" />
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-7 flex-1 text-sm"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Color
        </label>
        <div className="flex flex-wrap items-center gap-1.5">
          {TAG_COLOR_KEYS.map((key) => (
            <Button
              variant="ghost"
              size="icon"
              key={key}
              aria-label={key}
              aria-pressed={color === key}
              className="size-7 rounded-full"
              onClick={() => setColor(key)}
            >
              <span
                className={cn(
                  "size-4 rounded-full",
                  tagSwatchClass(key),
                  color === key &&
                    "ring-2 ring-foreground/60 ring-offset-2 ring-offset-popover",
                )}
              />
            </Button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between pt-1">
        <Button
          variant="link"
          className="h-auto p-0 inline-flex items-center gap-1 text-xs text-negative hover:underline disabled:opacity-50"
          onClick={onDelete}
          disabled={isBusy}
        >
          <Trash2 className="size-3" />
          Delete
        </Button>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-7 px-2"
            disabled={!canSave}
            onClick={() =>
              onSave({
                name: nameChanged ? name.trim() : undefined,
                color: colorChanged ? color : undefined,
              })
            }
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
