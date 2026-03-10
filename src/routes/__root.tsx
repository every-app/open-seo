/// <reference types="vite/client" />
import {
  ClientOnly,
  HeadContent,
  Link,
  Scripts,
  createRootRoute,
  Outlet,
  useLocation,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import { useState } from "react";
import { Menu, ChevronsUpDown } from "lucide-react";
import { DefaultCatchBoundary } from "@/client/components/DefaultCatchBoundary";
import { NotFound } from "@/client/components/NotFound";
import appCss from "@/client/styles/app.css?url";
import { Toaster } from "sonner";
import { Sidebar } from "@/client/components/Sidebar";
import { queryClient } from "@/client/tanstack-db";
import { projectNavItems } from "@/client/navigation/items";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      {
        name: "apple-mobile-web-app-capable",
        content: "yes",
      },
      {
        name: "apple-mobile-web-app-status-bar-style",
        content: "black-translucent",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      {
        rel: "apple-touch-icon",
        sizes: "180x180",
        href: "/apple-touch-icon.png",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "32x32",
        href: "/favicon-32x32.png",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "16x16",
        href: "/favicon-16x16.png",
      },
      { rel: "icon", href: "/favicon.ico" },
    ],
    scripts: [],
  }),
  component: AppLayout,
  errorComponent: DefaultCatchBoundary,
  notFoundComponent: () => <NotFound />,
  shellComponent: RootDocument,
});

function AppLayout() {
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Extract projectId from the current path
  const projectIdMatch = location.pathname.match(/^\/p\/([^/]+)/);
  const projectId = projectIdMatch?.[1] ?? null;

  return (
    <div className="flex flex-col h-[100dvh] bg-base-200">
      {/* Top Navbar */}
      <div className="navbar bg-base-100 border-b border-base-300 shrink-0 gap-2">
        {/* Mobile: hamburger + title */}
        <div className="flex-none flex items-center md:hidden">
          <button
            type="button"
            className="btn btn-square btn-ghost"
            aria-label="Toggle sidebar"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
          >
            <Menu className="h-6 w-6" />
          </button>
          <span className="font-semibold text-base-content ml-1">OpenSEO</span>
        </div>

        {/* Desktop: app brand + nav links (left) */}
        <div className="hidden md:flex items-center gap-1">
          <span className="text-lg font-semibold text-base-content px-2">
            OpenSEO
          </span>
          {projectId &&
            projectNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname.includes(item.matchSegment);

              return (
                <Link
                  key={item.to}
                  to={item.to}
                  params={{ projectId }}
                  className={`btn btn-sm gap-2 ${
                    isActive
                      ? "bg-primary/10 text-primary font-medium border-transparent"
                      : "btn-ghost text-base-content/60 hover:text-base-content"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Desktop: project switcher (right-aligned) */}
        <div className="flex-none hidden md:flex">
          <div
            className="tooltip tooltip-left before:whitespace-nowrap"
            data-tip="Multiple projects coming soon"
          >
            <button className="btn btn-ghost btn-sm font-medium text-sm gap-1 cursor-default">
              <span className="truncate">Default</span>
              <ChevronsUpDown className="size-3.5 shrink-0 text-base-content/40" />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile: drawer layout */}
      <div className="flex-1 min-h-0 md:hidden">
        <div className="h-full overflow-auto">
          <Outlet />
        </div>

        {drawerOpen ? (
          <div className="fixed inset-0 z-50">
            <button
              type="button"
              aria-label="Close sidebar"
              className="absolute inset-0 bg-black/45"
              onClick={() => setDrawerOpen(false)}
            />
            <div className="absolute left-0 top-0 h-full">
              <Sidebar
                currentPath={location.pathname}
                projectId={projectId}
                onNavigate={() => setDrawerOpen(false)}
                onClose={() => setDrawerOpen(false)}
              />
            </div>
          </div>
        ) : null}
      </div>

      {/* Desktop: plain content area */}
      <div className="hidden md:block flex-1 min-h-0 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const showDevtools =
    import.meta.env.DEV && import.meta.env.VITE_SHOW_DEVTOOLS !== "false";

  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <ClientOnly>
          <QueryClientProvider client={queryClient}>
            <>
              {children}
              <Toaster position="bottom-right" mobileOffset={{ bottom: 100 }} />
              {showDevtools ? (
                <TanStackDevtools
                  config={{ position: "bottom-right" }}
                  eventBusConfig={{ connectToServerBus: true }}
                  plugins={[
                    {
                      name: "TanStack Router",
                      render: <TanStackRouterDevtoolsPanel />,
                      defaultOpen: true,
                    },
                  ]}
                />
              ) : null}
            </>
          </QueryClientProvider>
        </ClientOnly>
        <Scripts />
      </body>
    </html>
  );
}
