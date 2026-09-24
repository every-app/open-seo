import * as React from "react"

import { cn } from "@/client/lib/utils"

/*
 * Simple sidebar primitive — a vertical navigation column with header/footer/item slots.
 * Elevation: sibling of main content at --card level, with inset separators.
 */

interface SidebarProps extends React.HTMLAttributes<HTMLElement> {
  collapsible?: boolean
}

const Sidebar = React.forwardRef<HTMLElement, SidebarProps>(
  ({ className, ...props }, ref) => (
    <aside
      ref={ref}
      className={cn(
        "flex h-full w-64 flex-col",
        "bg-card text-card-foreground border-r border-border",
        "[box-shadow:var(--shadow-s)]",
        className
      )}
      {...props}
    />
  )
)
Sidebar.displayName = "Sidebar"

const SidebarHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex items-center gap-2 px-4 py-3 border-b border-border", className)}
      {...props}
    />
  )
)
SidebarHeader.displayName = "SidebarHeader"

const SidebarContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex-1 overflow-y-auto p-2", className)} {...props} />
  )
)
SidebarContent.displayName = "SidebarContent"

const SidebarFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("px-4 py-3 border-t border-border", className)} {...props} />
  )
)
SidebarFooter.displayName = "SidebarFooter"

const SidebarGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col gap-0.5 py-2", className)} {...props} />
  )
)
SidebarGroup.displayName = "SidebarGroup"

const SidebarGroupLabel = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
        className
      )}
      {...props}
    />
  )
)
SidebarGroupLabel.displayName = "SidebarGroupLabel"

interface SidebarItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
  icon?: React.ReactNode
}

const SidebarItem = React.forwardRef<HTMLButtonElement, SidebarItemProps>(
  ({ className, active, icon, children, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      className={cn(
        "flex items-center gap-2.5 w-full rounded-md px-2 py-1.5 text-sm text-left",
        "transition-[background-color,color,box-shadow] duration-150",
        "text-muted-foreground hover:bg-accent hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        active &&
          "bg-accent text-foreground [box-shadow:var(--shadow-s)]",
        className
      )}
      {...props}
    >
      {icon && <span className="flex h-4 w-4 items-center justify-center shrink-0">{icon}</span>}
      <span className="flex-1 truncate">{children}</span>
    </button>
  )
)
SidebarItem.displayName = "SidebarItem"

export {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarItem,
}
