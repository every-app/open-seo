import { useEffect, useRef } from "react";

type DebugPayload = Record<string, unknown>;

function isDomainDebugEnabled() {
  if (typeof window === "undefined") return false;
  return (
    window.localStorage.getItem("debug:domain-overview") === "1" ||
    new URLSearchParams(window.location.search).get("debugDomain") === "1"
  );
}

export function debugDomain(event: string, payload?: DebugPayload) {
  if (!isDomainDebugEnabled()) return;
  const entry = {
    event,
    t: Math.round(performance.now()),
    ...payload,
  };
  console.info("[domain-debug]", JSON.stringify(entry));
}

export function useDomainRenderDebug(name: string, payload?: DebugPayload) {
  const countRef = useRef(0);
  countRef.current += 1;

  useEffect(() => {
    debugDomain(`${name}:render`, {
      count: countRef.current,
      ...payload,
    });
  });
}
