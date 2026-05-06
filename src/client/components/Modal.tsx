import { useEffect, type ReactNode } from "react";

export function Modal({
  maxWidth = "max-w-sm",
  children,
  onClose,
  labelledBy,
}: {
  maxWidth?: string;
  children: ReactNode;
  onClose?: () => void;
  labelledBy?: string;
}) {
  useEffect(() => {
    if (!onClose) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`card bg-base-100 border border-base-300 w-full ${maxWidth} shadow-xl`}
      >
        <div className="card-body gap-4">{children}</div>
      </div>
    </div>
  );
}
