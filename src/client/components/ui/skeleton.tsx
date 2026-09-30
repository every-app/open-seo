import { cn } from "@/client/lib/utils";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-xl bg-foreground/[0.06]", className)}
      {...props}
    />
  );
}

export { Skeleton };
