import { Check, ChevronDown, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function Collapsible({
  id,
  title,
  subtitle,
  icon,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const contentId = `collapsible-${id}`;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={contentId}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-base-300/50"
      >
        <div className="flex min-w-0 items-center gap-3">
          {icon ? (
            <span className="flex size-5 shrink-0 items-center justify-center text-base-content">
              {icon}
            </span>
          ) : null}
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm font-medium text-base-content">
              {title}
            </span>
            {subtitle ? (
              <span className="text-xs text-base-content/55">{subtitle}</span>
            ) : null}
          </div>
        </div>
        <ChevronDown
          className={`size-4 shrink-0 text-base-content/50 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open ? (
        <div id={contentId} className="space-y-4 px-4 pb-6 pt-3">
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function CodeBlock({
  code,
  onCopy,
}: {
  code: string;
  onCopy?: () => void;
}) {
  return (
    <div className="flex items-stretch overflow-hidden rounded-md border border-base-300 bg-base-100">
      <pre className="min-w-0 flex-1 overflow-x-auto p-3 text-xs leading-relaxed text-base-content">
        <code className="font-mono">{code}</code>
      </pre>
      <div className="flex shrink-0 items-start border-l border-base-300 p-1.5">
        <CopyButton
          value={code}
          successMessage="Copied to clipboard"
          iconOnly
          onCopy={onCopy}
        />
      </div>
    </div>
  );
}

export function CopyButton({
  value,
  successMessage,
  iconOnly = false,
  onCopy,
}: {
  value: string;
  successMessage: string;
  iconOnly?: boolean;
  onCopy?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      toast.error("Clipboard not available");
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      toast.success(successMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      onCopy?.();
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  if (iconOnly) {
    return (
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copy"
        className="flex size-7 items-center justify-center rounded-md text-base-content/60 transition-colors hover:bg-base-200 hover:text-base-content"
      >
        {copied ? (
          <Check className="size-3.5 text-success" />
        ) : (
          <Copy className="size-3.5" />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 rounded-md border border-base-300 bg-base-100 px-2 py-1 text-xs font-medium text-base-content/70 transition-colors hover:bg-base-300/50 hover:text-base-content"
    >
      {copied ? (
        <Check className="size-3 text-success" />
      ) : (
        <Copy className="size-3" />
      )}
      Copy
    </button>
  );
}
