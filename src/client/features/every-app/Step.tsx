import type { ReactNode } from "react";

/** One numbered step in the Every App move dialogs. */
export function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children?: ReactNode;
}) {
  return (
    <li className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-2">
      <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-medium">
        {number}
      </span>
      <div className="space-y-2">
        <p className="pt-0.5 text-sm font-medium">{title}</p>
        {children}
      </div>
    </li>
  );
}
