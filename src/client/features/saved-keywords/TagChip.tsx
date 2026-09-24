import type { ReactNode } from "react";
import {
  resolveTagColor,
  tagChipClass,
  tagDotClass,
} from "@/shared/tag-colors";
import type { SavedKeywordTag } from "@/types/keywords";

import { Button } from "@/client/components/ui/button";
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
  const ring = selected ? "ring-2 ring-offset-1 ring-offset-card" : "";

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
      <Button
        variant="ghost"
        title={title}
        className={`h-auto rounded-md text-inherit px-0 hover:bg-transparent ${base} ${interactive} ${ring}`}
        onClick={onClick}
      >
        {content}
      </Button>
    );
  }
  return (
    <span title={title} className={`${base} ${ring}`}>
      {content}
    </span>
  );
}
