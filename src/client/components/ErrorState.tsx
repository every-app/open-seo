import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { EmptyState } from "@/client/components/EmptyState";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";

/**
 * A failure message with an optional retry.
 *
 * - `inline`: red text and a small button, inside a card or a table.
 * - `card`: a destructive Alert, above or in place of a section.
 * - `page`: a centered block that replaces the whole page content.
 */
export function ErrorState({
  title,
  message,
  onRetry,
  isRetrying = false,
  action,
  variant = "card",
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  /** Shows the retry button as pending, for example while `isFetching`. */
  isRetrying?: boolean;
  /** Replaces the retry button, for errors a retry cannot fix. */
  action?: ReactNode;
  variant?: "inline" | "card" | "page";
}) {
  const button =
    action ??
    (onRetry ? (
      <Button
        variant="outline"
        size={variant === "page" ? "default" : "sm"}
        pending={isRetrying}
        onClick={onRetry}
      >
        Try again
      </Button>
    ) : null);

  if (variant === "page") {
    return (
      <EmptyState
        kind="error"
        variant="plain"
        size="lg"
        title={title ?? "Something went wrong"}
        description={message}
        action={button}
      />
    );
  }

  if (variant === "inline") {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-destructive"
      >
        <span>{message}</span>
        {button}
      </div>
    );
  }

  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden />
      <AlertTitle>{title ?? message}</AlertTitle>
      {title ? <AlertDescription>{message}</AlertDescription> : null}
      {button ? <div className="col-start-2 mt-2">{button}</div> : null}
    </Alert>
  );
}
