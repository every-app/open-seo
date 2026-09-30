"use client";

import { useEffect, useState } from "react";
import type { RefObject } from "react";

export const springInteraction = {
  type: "spring" as const,
  stiffness: 500,
  damping: 35,
};

export const springStateChange = {
  type: "spring" as const,
  stiffness: 400,
  damping: 30,
};

export function useDataState(
  ref: RefObject<HTMLElement | null>,
): string | null {
  const [state, setState] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    setState(el.getAttribute("data-state"));

    const observer = new MutationObserver(() => {
      setState(el.getAttribute("data-state"));
    });

    observer.observe(el, { attributes: true, attributeFilter: ["data-state"] });

    return () => observer.disconnect();
  }, [ref]);

  return state;
}
