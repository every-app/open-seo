import {
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { ArrowUp, Loader2, Square } from "lucide-react";

import { Button } from "@/client/components/ui/button";
import { Textarea } from "@/client/components/ui/textarea";
export function ChatComposer({
  busy,
  onSend,
  onStop,
  placeholder = "Ask Sam about your strategy or OpenSEO…",
}: {
  busy: boolean;
  onSend: (text: string) => void;
  /** Cancels the running turn; while busy the send button becomes Stop. */
  onStop?: () => void;
  placeholder?: string;
}) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the textarea up to a few lines, then scroll. Resetting height to
  // `auto` first lets it shrink as well as grow.
  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [value]);

  function submit() {
    const text = value.trim();
    if (!text || busy) return;
    onSend(text);
    setValue("");
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    submit();
  }

  function handleKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-end gap-2 rounded-xl border border-border bg-card px-3 py-2 focus-within:border-primary"
    >
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKey}
        rows={1}
        placeholder={placeholder}
        className="min-h-0 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 max-h-40 flex-1 resize-none  px-1 py-1 text-sm leading-relaxed  placeholder:text-muted-foreground/70 focus:"
      />
      {busy && onStop ? (
        <Button
          variant="outline"
          size="icon"
          type="button"
          aria-label="Stop"
          onClick={onStop}
          className="size-8"
        >
          <Square className="size-3.5 fill-current" />
        </Button>
      ) : (
        <Button
          size="icon"
          type="submit"
          aria-label="Send message"
          disabled={busy || !value.trim()}
          className="size-8"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ArrowUp className="size-4" />
          )}
        </Button>
      )}
    </form>
  );
}
