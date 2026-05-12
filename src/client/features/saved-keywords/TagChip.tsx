import type { ReactNode } from "react";
import {
  resolveTagColor,
  tagChipClass,
  tagDotClass,
} from "@/shared/tag-colors";
import type { SavedKeywordTag } from "@/types/keywords";

type Size = "xs" | "sm" | "md";

const SIZE_CLASS: Record<Size, string> = {
  xs: "h-5 px-1.5 text-[11px]",
  sm: "h-6 px-2 text-xs",
  md: "h-7 px-2.5 text-sm",
};

export function TagChip({
  tag,
  size = "sm",
  trailing,
  onClick,
  selected,
  title,
}: {
  tag: Pick<SavedKeywordTag, "id" | "name" | "color">;
  size?: Size;
  trailing?: ReactNode;
  onClick?: () => void;
  selected?: boolean;
  title?: string;
}) {
  const color = resolveTagColor(tag);
  const base = `inline-flex items-center gap-1.5 rounded-md font-medium ${SIZE_CLASS[size]} ${tagChipClass(color)}`;
  const interactive = onClick
    ? "cursor-pointer hover:brightness-110 transition"
    : "";
  const ring = selected ? "ring-2 ring-offset-1 ring-offset-base-100" : "";

  const content = (
    <>
      <span
        className={`size-1.5 shrink-0 rounded-full ${tagDotClass(color)}`}
      />
      <span className="truncate">{tag.name}</span>
      {trailing}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        title={title}
        className={`${base} ${interactive} ${ring}`}
        onClick={onClick}
      >
        {content}
      </button>
    );
  }
  return (
    <span title={title} className={`${base} ${ring}`}>
      {content}
    </span>
  );
}
