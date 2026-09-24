import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/client/components/ui/button";
export function CopyButton({
  value,
  successMessage,
  label = "Copy",
  iconOnly = false,
  primary = false,
  onCopy,
}: {
  value: string;
  successMessage: string;
  label?: string;
  iconOnly?: boolean;
  primary?: boolean;
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
      <Button
        variant="ghost"
        onClick={handleCopy}
        aria-label={label}
        className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        {copied ? (
          <Check className="size-3.5 text-success" />
        ) : (
          <Copy className="size-3.5" />
        )}
      </Button>
    );
  }

  return (
    <Button
      variant={primary ? "default" : "outline"}
      size={primary ? "default" : "sm"}
      onClick={handleCopy}
      className={primary ? undefined : "h-7 gap-1.5 px-2 text-xs"}
    >
      {copied ? (
        <Check className="size-3 text-success" />
      ) : (
        <Copy className="size-3" />
      )}
      {copied ? "Copied" : label}
    </Button>
  );
}
