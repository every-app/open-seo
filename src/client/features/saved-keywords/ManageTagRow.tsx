import { Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import {
  resolveTagColor,
  TAG_COLOR_KEYS,
  tagSwatchClass,
  type TagColorKey,
} from "@/shared/tag-colors";
import type { SavedKeywordTagSummary } from "@/types/keywords";

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
  const nameId = useId();
  const [name, setName] = useState(tag.name);
  const currentColor = resolveTagColor(tag);
  const [color, setColor] = useState<TagColorKey>(currentColor);
  const nameChanged = name.trim() !== tag.name && name.trim().length > 0;
  const colorChanged = color !== currentColor;
  const canSave = (nameChanged || colorChanged) && !isBusy;

  return (
    <div className="space-y-3 border-y border-border bg-muted/40 px-4 py-3">
      <div className="space-y-1.5">
        <Label htmlFor={nameId}>Name</Label>
        <Input
          id={nameId}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <p className="text-sm leading-none font-medium">Color</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {TAG_COLOR_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              aria-label={key}
              aria-pressed={color === key}
              className={`size-5 rounded-full transition outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${tagSwatchClass(key)} ${
                color === key
                  ? "ring-2 ring-foreground/40 ring-offset-2 ring-offset-background"
                  : "hover:scale-110"
              }`}
              onClick={() => setColor(key)}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="xs"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={onDelete}
          disabled={isBusy}
        >
          <Trash2 data-icon="inline-start" />
          Delete
        </Button>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="xs" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="xs"
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
