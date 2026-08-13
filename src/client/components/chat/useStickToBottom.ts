import { useLayoutEffect, useRef } from "react";

// Within this many pixels of the bottom still counts as "following along", so
// sub-pixel rounding and a half-rendered line don't unpin the view.
const BOTTOM_THRESHOLD_PX = 64;

/**
 * Keeps a chat scroll container pinned to the bottom while the user follows
 * along, and stops pinning as soon as they scroll up — until they scroll back
 * to the bottom, or `pinToBottom` is called because they sent a message.
 *
 * Pinned-ness is tracked from real scroll events rather than measured when
 * `messages` changes: by the time the effect runs the new chunk is already in
 * the DOM, so the distance to the bottom would look large and unpin mid-stream.
 */
export function useStickToBottom(messages: readonly unknown[], status: string) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);

  // useLayoutEffect (not useEffect) so the jump happens before paint and the
  // new chunk is never briefly visible below the fold.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  // Fires for our own pinning too, which simply recomputes to `true` — the jump
  // is instant, so there is no in-flight smooth scroll to misread.
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_THRESHOLD_PX;
  };

  // Sending re-pins: the user expects to follow their own message and the reply.
  const pinToBottom = () => {
    pinnedRef.current = true;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  return { scrollRef, onScroll, pinToBottom };
}
