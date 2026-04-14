import type { ReactNode } from "react";

export function Modal({
  maxWidth = "max-w-sm",
  children,
}: {
  maxWidth?: string;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className={`card bg-base-100 border border-base-300 w-full ${maxWidth} shadow-xl`}
      >
        <div className="card-body gap-4">{children}</div>
      </div>
    </div>
  );
}
