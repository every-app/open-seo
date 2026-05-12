import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
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
  const [name, setName] = useState(tag.name);
  const currentColor = resolveTagColor(tag);
  const [color, setColor] = useState<TagColorKey>(currentColor);
  const nameChanged = name.trim() !== tag.name && name.trim().length > 0;
  const colorChanged = color !== currentColor;
  const canSave = (nameChanged || colorChanged) && !isBusy;

  return (
    <div className="space-y-2 border-y border-base-300 bg-base-200/40 px-3 py-2.5">
      <div className="space-y-1">
        <label className="text-[11px] font-semibold uppercase tracking-wide text-base-content/55">
          Rename
        </label>
        <div className="flex items-center gap-1.5">
          <Pencil className="size-3 opacity-50" />
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="min-w-0 flex-1 rounded border border-base-300 bg-base-100 px-2 py-1 text-sm outline-none focus:border-primary"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-[11px] font-semibold uppercase tracking-wide text-base-content/55">
          Color
        </label>
        <div className="flex flex-wrap items-center gap-1.5">
          {TAG_COLOR_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              aria-label={key}
              className={`size-5 rounded-full transition ${tagSwatchClass(key)} ${
                color === key
                  ? "ring-2 ring-offset-2 ring-offset-base-200 ring-base-content/40"
                  : "hover:scale-110"
              }`}
              onClick={() => setColor(key)}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs text-error hover:underline disabled:opacity-50"
          onClick={onDelete}
          disabled={isBusy}
        >
          <Trash2 className="size-3" />
          Delete
        </button>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="rounded px-2 py-1 text-xs text-base-content/70 hover:bg-base-300"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded bg-primary px-2 py-1 text-xs font-medium text-primary-content disabled:opacity-50"
            disabled={!canSave}
            onClick={() =>
              onSave({
                name: nameChanged ? name.trim() : undefined,
                color: colorChanged ? color : undefined,
              })
            }
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
