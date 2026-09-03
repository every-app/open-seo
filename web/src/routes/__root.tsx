import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import * as React from "react";
import appCss from "@/styles/app.css?url";
import { RootProvider } from "fumadocs-ui/provider/tanstack";

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
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        {/* Dub referral attribution: partner links land here with ?dub_id=
            (and ?via=). Load Dub's script only for those visits — it persists
            the click id as a `dub_id` cookie on `.openseo.so` so the app at
            app.openseo.so can attribute the signup. Injected during the
            initial HTML parse (not idle-deferred like Plausible below) so the
            cookie lands before the visitor navigates to the app. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){var q=new URLSearchParams(window.location.search);if(!q.has('dub_id')&&!q.has('via'))return;var s=document.createElement('script');s.src='https://www.dubcdn.com/analytics/script.js';s.dataset.domains='{\"refer\":\"links.openseo.so\"}';s.dataset.cookieOptions='{\"domain\":\".openseo.so\"}';document.head.appendChild(s)})();",
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){function loadAnalytics(){if(window.__openSeoAnalyticsLoaded)return;window.__openSeoAnalyticsLoaded=true;window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)};plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init({endpoint:'/api/event'});var script=document.createElement('script');script.defer=true;script.src='/js/script.js';document.head.appendChild(script)}function schedule(){if('requestIdleCallback'in window){window.requestIdleCallback(loadAnalytics,{timeout:2000});return}window.setTimeout(loadAnalytics,2000)}if(document.readyState==='complete'){schedule();return}window.addEventListener('load',schedule,{once:true})})();",
          }}
        />
      </head>
      <body className="flex flex-col min-h-screen bg-fd-background text-fd-foreground">
        <RootProvider search={{ enabled: false }}>{children}</RootProvider>
        <Scripts />
      </body>
    </html>
  );
}
