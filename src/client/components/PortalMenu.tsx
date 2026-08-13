import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";

/**
 * Kebab actions menu rendered through a portal in fixed position, so it can't
 * be clipped by overflow containers (scrollable tables, overflow-hidden
 * cards). Opens below the trigger, right-aligned. Closes on outside click,
 * Escape, scroll, and resize.
 */
export function PortalMenu({
  ariaLabel,
  triggerClassName = "btn btn-ghost btn-xs btn-square",
  triggerContent = <MoreHorizontal className="size-3.5" />,
  menuClassName = "w-40",
  children,
}: {
  ariaLabel: string;
  triggerClassName?: string;
  triggerContent?: ReactNode;
  menuClassName?: string;
  /** Menu <li> items; call `close` before running an item's action. */
  children: (close: () => void) => ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLUListElement | null>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        (buttonRef.current?.contains(target) ||
          menuRef.current?.contains(target))
      ) {
        return;
      }
      setIsOpen(false);
    };
    const close = () => setIsOpen(false);
    const closeOnScroll = (event: Event) => {
      // Scrolling inside the menu itself shouldn't dismiss it.
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("scroll", closeOnScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("scroll", closeOnScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [isOpen]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={triggerClassName}
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        onClick={() => {
          const rect = buttonRef.current?.getBoundingClientRect();
          if (rect) setPosition({ top: rect.bottom + 4, left: rect.right });
          setIsOpen((open) => !open);
        }}
      >
        {triggerContent}
      </button>
      {isOpen && typeof document !== "undefined"
        ? createPortal(
            <ul
              ref={menuRef}
              className={`menu fixed z-[1000] -translate-x-full rounded-box border border-base-300 bg-base-100 p-2 shadow-lg ${menuClassName}`}
              style={{ top: position.top, left: position.left }}
            >
              {children(() => setIsOpen(false))}
            </ul>,
            document.body,
          )
        : null}
    </>
  );
}
