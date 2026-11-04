// Meta standard events sent from openseo.so. The app's signup, setup, checkout
// and subscription events go to the Conversions API
// (src/server/referrals/meta.ts).

export enum MetaEvent {
  AddToCart = "AddToCart",
  ViewContent = "ViewContent",
}

type MetaEventParams = {
  content_ids?: string[];
  content_name?: string;
  content_type?: "product";
  currency?: string;
  value?: number;
};

/**
 * /js/meta.js only defines `fbq` where the visitor's advertising choice allows
 * it, so everywhere else this sends nothing.
 */
export function trackMetaEvent(event: MetaEvent, params?: MetaEventParams) {
  const fbq: unknown = Reflect.get(window, "fbq");
  if (typeof fbq === "function") fbq("track", event, params);
}

// The pages worth more to an ad than the PageView every page sends.
const PRODUCT_PAGE = /^\/(pricing|features)(\/|$)/;

export function trackMetaPageContent(pathname: string) {
  if (PRODUCT_PAGE.test(pathname)) trackMetaEvent(MetaEvent.ViewContent);
}
