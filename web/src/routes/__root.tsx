import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
  useLocation,
} from "@tanstack/react-router";
import * as React from "react";
import appCss from "@/styles/app.css?url";
import { RootProvider } from "fumadocs-ui/provider/tanstack";
import { PrivacyChoices } from "@/components/privacy-choices";
import { ANALYTICS_SCRIPT } from "@/lib/analytics-script";
import { isReportPath } from "@/lib/seo-report/links";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
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
      { rel: "manifest", href: "/site.webmanifest" },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: ANALYTICS_SCRIPT }} />
      </head>
      <body className="flex flex-col min-h-screen bg-fd-background text-fd-foreground">
        <RootProvider search={{ enabled: false }}>{children}</RootProvider>
        {/* Privacy choices are about the ad pixel and referral scripts, and a
            written report loads neither (lib/seo-report/links.ts). */}
        {isReportPath(pathname) ? null : <PrivacyChoices />}
        <Scripts />
      </body>
    </html>
  );
}
