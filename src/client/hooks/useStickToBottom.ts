import { useCallback, useRef } from "react";

/**
 * How far from the bottom still counts as "following along". Wide enough to
 * survive fractional scroll positions and the few pixels a growing reply adds
 * between a scroll event and the next render.
 */
const FOLLOW_THRESHOLD_PX = 48;

type ScrollMetrics = Pick<
  HTMLElement,
  "scrollHeight" | "scrollTop" | "clientHeight"
>;

/** Whether the viewport is close enough to the bottom to keep pinning it. */
export function isFollowingBottom(
  { scrollHeight, scrollTop, clientHeight }: ScrollMetrics,
  threshold: number = FOLLOW_THRESHOLD_PX,
): boolean {
  return scrollHeight - scrollTop - clientHeight <= threshold;
}

/**
 * Keeps a scroll container pinned to the bottom while new content arrives, but
 * only for as long as the reader stays there. Scrolling up during a streaming
 * reply releases the pin; scrolling back down re-arms it.
 *
 * Wire `scrollRef` and `onScroll` to the container, then call `stickToBottom`
 * from an effect keyed on whatever grows the content. The caller keeps that
 * dependency list so it stays statically checkable.
 */
export function useStickToBottom() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isFollowingRef = useRef(true);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (el) isFollowingRef.current = isFollowingBottom(el);
  }, []);

  const stickToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el && isFollowingRef.current) el.scrollTop = el.scrollHeight;
  }, []);

  return { scrollRef, onScroll, stickToBottom };
}
