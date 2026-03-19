/// <reference types="vite/client" />
import {
  ClientOnly,
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
  useLocation,
  useMatches,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import { useState } from "react";
import { DefaultCatchBoundary } from "@/client/components/DefaultCatchBoundary";
import { NotFound } from "@/client/components/NotFound";
import appCss from "@/client/styles/app.css?url";
import { Toaster } from "sonner";
import { queryClient } from "@/client/tanstack-db";
import { getSeoApiKeyStatus } from "@/serverFunctions/config";
import {
  AppContent,
  MissingSeoSetupModal,
  SeoApiStatusBanners,
  TopNav,
} from "@/client/layout/AppShell";

const DATAFORSEO_HELP_PATH = "/help/dataforseo-api-key";

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
  const isAuthLayout = useMatches({
    select: (matches) => matches.some((match) => match.routeId === "/_auth"),
  });

  if (isAuthLayout) {
    return <Outlet />;
  }

  return <AppShellLayout />;
}

function AppShellLayout() {
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const setupModalRef = React.useRef<HTMLDivElement | null>(null);
  const [isSeoApiKeyConfigured, setIsSeoApiKeyConfigured] = useState<
    boolean | null
  >(null);
  const [seoApiKeyStatusError, setSeoApiKeyStatusError] = useState(false);
  const [showMissingSeoApiKeyModal, setShowMissingSeoApiKeyModal] =
    useState(false);

  const projectIdMatch = location.pathname.match(/^\/p\/([^/]+)/);
  const projectId = projectIdMatch?.[1] ?? null;

  React.useEffect(() => {
    let cancelled = false;

    const checkSeoApiKeyStatus = async () => {
      try {
        const result = await getSeoApiKeyStatus();
        if (cancelled) return;

        setSeoApiKeyStatusError(false);
        setIsSeoApiKeyConfigured(result.configured);
        if (!result.configured) {
          setShowMissingSeoApiKeyModal(true);
        }
      } catch {
        if (cancelled) return;
        setSeoApiKeyStatusError(true);
        setIsSeoApiKeyConfigured(null);
        setShowMissingSeoApiKeyModal(false);
      }
    };

    void checkSeoApiKeyStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  const shouldShowMissingSeoApiKeyModal =
    showMissingSeoApiKeyModal && location.pathname !== DATAFORSEO_HELP_PATH;

  const shouldShowSeoApiWarning =
    !seoApiKeyStatusError &&
    isSeoApiKeyConfigured === false &&
    !shouldShowMissingSeoApiKeyModal;

  React.useEffect(() => {
    if (!shouldShowMissingSeoApiKeyModal) return;

    setupModalRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowMissingSeoApiKeyModal(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [shouldShowMissingSeoApiKeyModal]);

  return (
    <div className="flex flex-col h-[100dvh] bg-base-200">
      <TopNav
        drawerOpen={drawerOpen}
        projectId={projectId}
        pathname={location.pathname}
        onOpenDrawer={() => setDrawerOpen(true)}
      />

      <SeoApiStatusBanners
        shouldShowSeoApiWarning={shouldShowSeoApiWarning}
        seoApiKeyStatusError={seoApiKeyStatusError}
      />

      <AppContent
        drawerOpen={drawerOpen}
        pathname={location.pathname}
        projectId={projectId}
        onCloseDrawer={() => setDrawerOpen(false)}
      />

      <MissingSeoSetupModal
        ref={setupModalRef}
        isOpen={shouldShowMissingSeoApiKeyModal}
        onClose={() => setShowMissingSeoApiKeyModal(false)}
      />
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
