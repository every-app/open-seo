import { ChevronDown, Download, Loader2, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export function TableBulkActionBar({
  selectedCount,
  selectedLabel = "selected",
  actions,
  onClear,
  placement = "fixed",
}: {
  selectedCount: number;
  selectedLabel?: string;
  actions: ReactNode;
  onClear: () => void;
  placement?: "fixed" | "inline";
}) {
  if (selectedCount === 0) return null;

  const wrapperClass =
    placement === "fixed"
      ? "pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-4"
      : "flex justify-center";
  const toolbarClass =
    placement === "fixed"
      ? "pointer-events-auto flex items-stretch overflow-visible rounded-xl border border-base-content/15 bg-base-300/85 shadow-2xl backdrop-blur"
      : "flex items-stretch overflow-visible rounded-xl border border-base-content/15 bg-base-200";

  return (
    <div className={wrapperClass}>
      <div role="toolbar" aria-label="Bulk actions" className={toolbarClass}>
        <div className="flex items-center gap-2 border-r border-base-content/10 px-3 py-2 text-sm">
          <button
            type="button"
            aria-label="Clear selection"
            className="-ml-1 rounded p-1 text-base-content/55 hover:bg-base-content/10 hover:text-base-content"
            onClick={onClear}
          >
            <X className="size-3.5" />
          </button>
          <span className="font-medium tabular-nums">{selectedCount}</span>
          <span className="text-base-content/60">{selectedLabel}</span>
        </div>
        {actions}
      </div>
    </div>
  );
}

export function TableBulkActionButton({
  icon,
  children,
  onClick,
  disabled,
  variant = "default",
}: {
  icon?: ReactNode;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "danger";
}) {
  const color =
    variant === "danger"
      ? "text-error hover:bg-error/10"
      : "text-base-content/85 hover:bg-base-content/10";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm disabled:opacity-50 ${color}`}
    >
      {icon}
      {children}
    </button>
  );
}

export function TableBulkExportMenu({
  actions,
  busy,
}: {
  actions: Array<{
    label: ReactNode;
    icon?: ReactNode;
    onClick: () => void;
    disabled?: boolean;
  }>;
  busy?: boolean;
}) {
  return (
    <div className="dropdown dropdown-top dropdown-end">
      <button
        type="button"
        tabIndex={0}
        disabled={busy}
        aria-haspopup="menu"
        className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-base-content/85 hover:bg-base-content/10 disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Download className="size-3.5" />
        )}
        Export
        <ChevronDown className="size-3 opacity-60" />
      </button>
      <ul
        tabIndex={0}
        role="menu"
        className="dropdown-content menu z-10 mb-2 w-52 rounded-box border border-base-300 bg-base-100 p-2 shadow-lg"
      >
        {actions.map((action, index) => (
          <li key={index}>
            <button
              type="button"
              onClick={action.onClick}
              disabled={busy || action.disabled}
            >
              {action.icon}
              {action.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TableExportMenu({
  actions,
  buttonClassName = "btn btn-sm gap-1",
  menuClassName = "z-10 menu p-2 shadow-lg bg-base-100 border border-base-300 rounded-box w-56",
}: {
  actions: Array<{
    label: ReactNode;
    icon?: ReactNode;
    onClick: () => void;
    disabled?: boolean;
  }>;
  buttonClassName?: string;
  menuClassName?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !containerRef.current?.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsOpen(false);
      triggerRef.current?.focus();
    };
    const closeOnOutsideFocus = (event: FocusEvent) => {
      if (
        event.target instanceof Node &&
        !containerRef.current?.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("focusin", closeOnOutsideFocus);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("focusin", closeOnOutsideFocus);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        className={buttonClassName}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        onClick={() => setIsOpen((open) => !open)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown") return;
          event.preventDefault();
          setIsOpen(true);
          requestAnimationFrame(() => {
            containerRef.current
              ?.querySelector<HTMLButtonElement>("ul button:not(:disabled)")
              ?.focus();
          });
        }}
      >
        <Download className="size-4" />
        Export
        <ChevronDown className="size-3 opacity-60" />
      </button>
      {isOpen ? (
        <ul
          id={menuId}
          role="menu"
          className={`${menuClassName} absolute top-full right-0 mt-2`}
          onKeyDown={(event) => {
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
              return;
            }
            event.preventDefault();
            const items = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>(
                "button:not(:disabled)",
              ),
            );
            const current = items.findIndex(
              (item) => item === document.activeElement,
            );
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? items.length - 1
                  : event.key === "ArrowDown"
                    ? (current + 1) % items.length
                    : (current - 1 + items.length) % items.length;
            items[next]?.focus();
          }}
        >
          {actions.map((action, index) => (
            <li key={index} role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsOpen(false);
                  action.onClick();
                }}
                disabled={action.disabled}
              >
                {action.icon}
                {action.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
