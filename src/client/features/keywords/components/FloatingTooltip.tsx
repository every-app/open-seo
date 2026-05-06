import type { ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";

type Position = { top: number; left: number };

export function FloatingTooltip({
  id,
  position,
  children,
}: {
  id: string;
  position: Position;
  children: ReactNode;
}) {
  return (
    <span
      id={id}
      role="tooltip"
      className="pointer-events-none fixed z-[1000] w-max max-w-64 -translate-x-1/2 -translate-y-full rounded-md border border-base-300 bg-base-100 px-2.5 py-2 text-[11px] font-normal normal-case leading-snug text-base-content shadow-md"
      style={{ left: position.left, top: position.top }}
    >
      {children}
    </span>
  );
}

export function useFloatingTooltip<T extends HTMLElement>({
  delayMs = 150,
  enabled = true,
}: {
  delayMs?: number;
  enabled?: boolean;
} = {}) {
  const tooltipId = useId();
  const triggerRef = useRef<T | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<Position>({ top: 0, left: 0 });

  const updatePosition = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({
      top: rect.top - 8,
      left: rect.left + rect.width / 2,
    });
  };

  const clearOpenTimeout = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const open = () => {
    if (!enabled) return;
    updatePosition();
    setIsOpen(true);
  };

  const scheduleOpen = () => {
    if (!enabled) return;
    clearOpenTimeout();
    timeoutRef.current = setTimeout(() => {
      open();
      timeoutRef.current = null;
    }, delayMs);
  };

  const close = () => {
    clearOpenTimeout();
    setIsOpen(false);
  };

  useEffect(() => clearOpenTimeout, []);

  useEffect(() => {
    if (!isOpen) return;

    updatePosition();

    const handleReposition = () => updatePosition();
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);

    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [isOpen]);

  return {
    close,
    isOpen,
    open,
    position,
    scheduleOpen,
    tooltipId,
    triggerRef,
  };
}
