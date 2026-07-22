import { Copy } from "lucide-react";
import { toast } from "sonner";

/** Small header action: copies one report section as markdown-ish text. */
export function SectionCopyButton({ getText }: { getText: () => string }) {
  return (
    <button
      type="button"
      aria-label="Copy section"
      title="Copy section"
      className="btn btn-ghost btn-xs gap-1 px-1.5 text-base-content/40 hover:text-base-content"
      onClick={() => {
        void navigator.clipboard.writeText(getText());
        toast.success("Section copied.");
      }}
    >
      <Copy className="size-3.5" />
      Copy
    </button>
  );
}
