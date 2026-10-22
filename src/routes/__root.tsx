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
import { captureGoogleLinkError } from "@/client/features/integrations/googleLinkError";
import { ExportToSheetsModal } from "@/client/components/table/ExportToSheetsModal";
import { themePreferenceInitScript } from "@/client/lib/theme";
import { NotFound } from "@/client/components/NotFound";
import { PrivacyBootstrap } from "@/client/components/PrivacyChoices";
import { TooltipProvider } from "@/client/components/ui/tooltip";
import appCss from "@/client/styles/app.css?url";
import { Toaster } from "sonner";
import { queryClient } from "@/client/tanstack-db";

// Capture Google link error params before the router starts — a route loader
// redirect would otherwise replace the URL and lose them. See googleLinkError.ts.
captureGoogleLinkError();

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        title: "OpenSEO",
      },
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      // Disable browser auto-translate (Google Translate) app-wide. It rewrites
      // text nodes into <font> wrappers, which React then can't remove/insert,
      // crashing render with NotFoundError ("removeChild"/"insertBefore"). The
      // product UI is data-dense (keywords, domains, metrics) and not meaningful
      // to machine-translate; the marketing site is a separate app and unaffected.
      {
        name: "google",
        content: "notranslate",
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
      { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
      { rel: "manifest", href: "/site.webmanifest" },
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

function RootDocument({ children }: { children: React.ReactNode }) {
  const showDevtools =
    import.meta.env.DEV && import.meta.env.VITE_SHOW_DEVTOOLS !== "false";

  return (
    <html suppressHydrationWarning translate="no">
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: themePreferenceInitScript }}
        />
        <HeadContent />
      </head>
      <body>
        <ClientOnly>
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
              <PrivacyBootstrap />
              {children}
              <ExportToSheetsModal />
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
            </TooltipProvider>
          </QueryClientProvider>
        </ClientOnly>
        <Scripts />
      </body>
    </html>
  );
}
