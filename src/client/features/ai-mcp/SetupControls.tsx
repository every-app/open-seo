import { Check, Copy } from "@/client/components/icons";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/client/components/ui/button";
import { cn } from "@/client/lib/utils";

export function CopyButton({
  value,
  successMessage,
  label = "Copy",
  iconOnly = false,
  primary = false,
  onCopy,
  className,
}: {
  value: string;
  successMessage: string;
  label?: string;
  iconOnly?: boolean;
  primary?: boolean;
  onCopy?: () => void;
  className?: string;
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
        size="icon"
        onClick={handleCopy}
        aria-label={label}
        className={cn("size-7", className)}
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
      className={cn(!primary && "h-7 gap-1.5 px-2 text-xs", className)}
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
