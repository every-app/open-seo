import { Pencil, Trash2 } from "lucide-react";
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
              key={key}
              aria-label={key}
              className={`text-inherit size-5 rounded-full transition ${tagSwatchClass(key)} ${
                color === key
                  ? "ring-2 ring-offset-2 ring-offset-muted ring-foreground/40"
                  : "hover:scale-110"
              }`}
              onClick={() => setColor(key)}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between pt-1">
        <Button
          variant="link"
          className="h-auto p-0 inline-flex items-center gap-1 text-xs text-destructive hover:underline disabled:opacity-50"
          onClick={onDelete}
          disabled={isBusy}
        >
          <Trash2 className="size-3" />
          Delete
        </Button>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            className="h-auto rounded px-2 py-1 text-xs text-muted-foreground hover:bg-border"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            className="h-auto rounded px-2 py-1 text-xs disabled:opacity-50"
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
