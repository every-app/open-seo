import * as React from "react"
import { Icon } from "@iconify/react"

import { cn } from "@/client/lib/utils"

export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string
  value: React.ReactNode
  icon?: string
  change?: {
    value: string | number
    direction?: "up" | "down" | "neutral"
  }
  description?: React.ReactNode
}

/** Narrows a stat delta to a number, so a negative one points the trend down. */
function isNumericDelta<TValue>(value: TValue | number): value is number {
  return typeof value === "number"
}

const StatCard = React.forwardRef<HTMLDivElement, StatCardProps>(
  ({ className, label, value, icon, change, description, ...props }, ref) => {
    const delta = change?.value
    const direction = change?.direction ?? (isNumericDelta(delta) && delta < 0 ? "down" : "up")
    const changeColor =
      direction === "up"
        ? "text-[oklch(0.78_0.15_145)]"
        : direction === "down"
        ? "text-destructive"
        : "text-muted-foreground"
    const changeIcon =
      direction === "up" ? "ph:arrow-up" : direction === "down" ? "ph:arrow-down" : "ph:minus"

    return (
      <div
        ref={ref}
        className={cn(
          "rounded-lg p-5 bg-card text-card-foreground",
          "[box-shadow:var(--shadow-s)]",
          "transition-[background-color,box-shadow] duration-200",
          "hover:[box-shadow:var(--shadow-m)]",
          className
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </div>
          {icon && (
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-primary [box-shadow:var(--shadow-s)]">
              <Icon icon={icon} className="h-4 w-4" />
            </div>
          )}
        </div>
        <div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div>
        {(change || description) && (
          <div className="mt-2 flex items-center gap-2 text-xs">
            {change && (
              <span className={cn("inline-flex items-center gap-0.5 font-medium", changeColor)}>
                <Icon icon={changeIcon} className="h-3 w-3" />
                {change.value}
              </span>
            )}
            {description && <span className="text-muted-foreground">{description}</span>}
          </div>
        )}
      </div>
    )
  }
)
StatCard.displayName = "StatCard"

export { StatCard }
