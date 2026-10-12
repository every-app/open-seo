import { cn } from "cn";
import { Spinner as SpinnerIcon } from "@/client/components/ui/spinner";

/** A loading indicator with an optional visible label, e.g. "Checking…". */
export function Spinner({
  size = "md",
  label,
  className,
}: {
  size?: "sm" | "md";
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-sm text-muted-foreground",
        className,
      )}
    >
      {/* The icon is the status element, so it carries the label for screen readers. */}
      <SpinnerIcon
        aria-label={label ?? "Loading"}
        className={size === "sm" ? "size-4" : "size-6"}
      />
      {label ? <span aria-hidden>{label}</span> : null}
    </span>
  );
}

/**
 * A full-screen spinner for the sign-in and account layouts, which have no app
 * chrome to show while the session loads. In the app, pages show skeletons.
 */
export function PageLoading() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Spinner />
    </div>
  );
}
