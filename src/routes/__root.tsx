/// <reference types="vite/client" />
import {
  ClientOnly,
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import { DefaultCatchBoundary } from "@/client/components/DefaultCatchBoundary";
import { initPostHog } from "@/client/lib/posthog";
import { NotFound } from "@/client/components/NotFound";
import appCss from "@/client/styles/app.css?url";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { Toaster } from "sonner";
import { queryClient } from "@/client/tanstack-db";

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
  return <Outlet />;
}

function PostHogBootstrap() {
  const isHostedMode = isHostedClientAuthMode();

  React.useEffect(() => {
    if (!isHostedMode) {
      return;
    }

    initPostHog();
  }, [isHostedMode]);

  return null;
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
              <PostHogBootstrap />
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
