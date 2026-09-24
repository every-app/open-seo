import {
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { ArrowUp, Loader2, Square } from "lucide-react";
import { brand } from "@/shared/brand";

export function ChatComposer({
  busy,
  onSend,
  onStop,
  placeholder = `Ask Sam about your strategy or ${brand.name}…`,
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
      className="flex items-end gap-2 rounded-box border border-base-300 bg-base-100 px-3 py-2 focus-within:border-primary"
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKey}
        rows={1}
        placeholder={placeholder}
        className="max-h-40 flex-1 resize-none border-0 bg-transparent px-1 py-1 text-sm leading-relaxed outline-none placeholder:text-base-content/50 focus:outline-none"
      />
      {busy && onStop ? (
        <button
          type="button"
          aria-label="Stop"
          onClick={onStop}
          className="btn btn-neutral btn-circle btn-sm"
        >
          <Square className="size-3.5 fill-current" />
        </button>
      ) : (
        <button
          type="submit"
          aria-label="Send message"
          disabled={busy || !value.trim()}
          className="btn btn-primary btn-circle btn-sm"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ArrowUp className="size-4" />
          )}
        </button>
      )}
    </form>
  );
}
