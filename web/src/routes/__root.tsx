import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import * as React from "react";
import appCss from "@/styles/app.css?url";
import { RootProvider } from "fumadocs-ui/provider/tanstack";
import { PrivacyChoices } from "@/components/privacy-choices";

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
        {/* Plausible and OpenAnalytics count visits without cookies, so they run
            for everyone; the Visit counts opt-out (plausible_ignore) skips both.
            Deferred to idle so they never compete with the page's own work. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){function loadAnalytics(){if(window.__openSeoAnalyticsLoaded)return;window.__openSeoAnalyticsLoaded=true;window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)};plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init({endpoint:'/api/event'});var script=document.createElement('script');script.defer=true;script.src='/js/script.js';document.head.appendChild(script);try{if(localStorage.getItem('plausible_ignore')==='true')return}catch(e){}var openAnalytics=document.createElement('script');openAnalytics.defer=true;openAnalytics.src='https://analytics.everyapp.team/script.js?siteId=72114522-d4bd-4f7e-b73b-62ccdaeae482';openAnalytics.setAttribute('data-openseo-openanalytics','');document.head.appendChild(openAnalytics)}function schedule(){if('requestIdleCallback'in window){window.requestIdleCallback(loadAnalytics,{timeout:2000});return}window.setTimeout(loadAnalytics,2000)}if(document.readyState==='complete'){schedule();return}window.addEventListener('load',schedule,{once:true})})();",
          }}
        />
      </head>
      <body className="flex flex-col min-h-screen bg-fd-background text-fd-foreground">
        <RootProvider search={{ enabled: false }}>{children}</RootProvider>
        <PrivacyChoices />
        <Scripts />
      </body>
    </html>
  );
}
