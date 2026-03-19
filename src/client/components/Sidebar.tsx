import { Link } from "@tanstack/react-router";
import { ChevronsUpDown, X } from "lucide-react";
import { getProjectNavItems } from "@/client/navigation/items";

interface SidebarProps {
  currentPath: string;
  projectId: string | null;
  onNavigate?: () => void;
  onClose?: () => void;
}

export function Sidebar({
  currentPath,
  projectId,
  onNavigate,
  onClose,
}: SidebarProps) {
  // If we don't have a projectId yet (e.g., root redirect hasn't fired),
  // don't render nav links since we can't build the URLs.
  if (!projectId) {
    return (
      <div className="sidebar w-64 border-r border-base-300 h-full bg-base-100 flex flex-col">
        <div className="px-4 py-4 border-b border-base-300 flex items-center justify-between">
          <span className="font-semibold text-base-content">OpenSEO</span>
          {onClose && (
            <button
              onClick={onClose}
              className="btn btn-ghost btn-sm btn-circle"
              aria-label="Close sidebar"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
        <div className="flex-1 flex items-center justify-center">
          <span className="loading loading-spinner loading-sm" />
        </div>
      </div>
    );
  }

  const projectNavItems = getProjectNavItems(projectId);

  return (
    <div className="sidebar w-64 border-r border-base-300 h-full bg-base-100 flex flex-col">
      {/* Header */}
      <div className="px-4 py-4 border-b border-base-300 flex items-center justify-between">
        <span className="font-semibold text-base-content">OpenSEO</span>
        {onClose && (
          <button
            onClick={onClose}
            className="btn btn-ghost btn-sm btn-circle"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Project picker */}
      <div className="px-3 py-3 border-b border-base-300">
        <div
          className="tooltip tooltip-bottom w-full"
          data-tip="Multiple projects coming soon"
        >
          <button className="btn btn-ghost btn-sm w-full justify-between font-medium text-sm cursor-default">
            <span className="truncate">Default</span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-base-content/40" />
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 pl-3 overflow-y-auto">
        {projectNavItems.map((item) => {
          const { icon: Icon, matchSegment, ...linkProps } = item;
          const isActive = currentPath.includes(matchSegment);

          return (
            <Link
              key={linkProps.to}
              {...linkProps}
              onClick={onNavigate}
              className={`relative flex items-center gap-3 pl-4 pr-4 py-2 text-sm transition-colors ${
                isActive
                  ? "text-base-content font-medium"
                  : "text-base-content/60 hover:text-base-content hover:bg-base-200"
              }`}
            >
              {isActive && (
                <div className="absolute left-0 top-1 bottom-1 w-[3px] bg-primary rounded-r-full" />
              )}
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
