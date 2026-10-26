import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { requestPrivacyChoices } from "../../../../src/shared/privacy-choices";

// Meta Pixel, served first-party. The browser requests it unless the visitor
// turned advertising off or sends Global Privacy Control
// (components/privacy-choices.tsx). This route makes the final call from the
// privacy cookie, CF-IPCountry and Sec-GPC, so a visitor without a saved
// choice needs no separate region lookup. Where the pixel isn't allowed, or
// on a worker without META_PIXEL_ID (like preview), it serves an empty script.
// The pixel's `_fbp`/`_fbc` cookies are what the app's signup Conversions API
// event (src/server/referrals/meta.ts) attributes against.
export const Route = createFileRoute("/js/meta.js")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const value: unknown = Reflect.get(env, "META_PIXEL_ID");
        const pixelId = typeof value === "string" ? value : "";
        const allowed = pixelId && requestPrivacyChoices(request).advertising;
        return new Response(allowed ? buildPixelScript(pixelId) : "", {
          headers: {
            "content-type": "application/javascript; charset=utf-8",
            // The answer depends on the visitor's cookie and location.
            "cache-control": "private, no-store",
          },
        });
      },
    },
  },
});

// Meta's base code, with automatic configuration turned off before init so the
// pixel doesn't collect button text or page metadata. PageView is the only
// event sent.
function buildPixelScript(pixelId: string) {
  const id = JSON.stringify(pixelId);
  return `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('set','autoConfig',false,${id});fbq('init',${id});fbq('track','PageView');`;
}
