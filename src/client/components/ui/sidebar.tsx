import * as React from "react";
import { cn } from "@/client/lib/utils";

// Halo Sidebar: navigation sidebar component
// Translucent surface with backdrop-blur, subtle white borders, pill-shaped toggles

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  collapsed?: boolean;
}

const Sidebar = React.forwardRef<HTMLDivElement, SidebarProps>(
  ({ className, collapsed, children, ...props }, ref) => (
    <div
      ref={ref}
      data-collapsed={collapsed}
      className={cn(
        "flex h-full flex-col",
        "backdrop-blur-xl bg-white/[0.06] border-r border-white/10",
        "transition-[width] duration-200",
        collapsed ? "w-16" : "w-60",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  ),
);
Sidebar.displayName = "Sidebar";

const SidebarHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex h-14 items-center border-b border-white/10 px-4",
      className,
    )}
    {...props}
  />
));
SidebarHeader.displayName = "SidebarHeader";

const SidebarContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-1 flex-col gap-1 overflow-y-auto p-2", className)}
    {...props}
  />
));
SidebarContent.displayName = "SidebarContent";

const SidebarFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("border-t border-white/10 p-2", className)}
    {...props}
  />
));
SidebarFooter.displayName = "SidebarFooter";

interface SidebarItemProps extends React.HTMLAttributes<HTMLButtonElement> {
  icon?: React.ReactNode;
  label: string;
  active?: boolean;
  collapsed?: boolean;
}

// Exported so navigation links (router <Link>s) can take the item look
// without nesting an anchor inside the item's <button>.
function sidebarItemClassName(active?: boolean, className?: string) {
  return cn(
    "flex w-full items-center gap-2.5 rounded-full px-3 py-2 text-sm font-medium transition-all duration-200",
    active
      ? "bg-white/[0.1] text-foreground shadow-[inset_0_0_8px_oklch(1_0_0/0.12)]"
      : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground",
    className,
  );
}

const SidebarItem = React.forwardRef<HTMLButtonElement, SidebarItemProps>(
  ({ className, icon, label, active, collapsed, ...props }, ref) => (
    <button
      ref={ref}
      className={sidebarItemClassName(
        active,
        cn(collapsed && "justify-center px-2", className),
      )}
      {...props}
    >
      {icon && <span className="shrink-0 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  ),
);
SidebarItem.displayName = "SidebarItem";

const SidebarGroup = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col gap-0.5", className)}
    {...props}
  />
));
SidebarGroup.displayName = "SidebarGroup";

const SidebarGroupLabel = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn(
      "mb-1 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground/60",
      className,
    )}
    {...props}
  />
));
SidebarGroupLabel.displayName = "SidebarGroupLabel";

export {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarItem,
  sidebarItemClassName,
  SidebarGroup,
  SidebarGroupLabel,
};
