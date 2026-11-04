import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  captureMetaCheckoutStart,
  captureMetaPurchase,
  captureMetaSetupStep,
  captureMetaSignup,
  MetaSetupEvent,
  pinMetaCheckout,
} from "./meta";

const kv = vi.hoisted(() => new Map<string, string>());
vi.mock("cloudflare:workers", () => ({
  env: {
    META_PIXEL_ID: "123",
    META_CONVERSIONS_API_TOKEN: "token",
    KV: {
      get: async (key: string): Promise<unknown> => {
        const value = kv.get(key);
        return value === undefined ? null : JSON.parse(value);
      },
      put: async (key: string, value: string) => void kv.set(key, value),
      delete: async (key: string) => void kv.delete(key),
    },
  },
  waitUntil: (promise: Promise<unknown>) => promise,
}));
vi.mock("@/server/lib/posthog", () => ({ captureServerError: vi.fn() }));

const fetchMock = vi.fn<typeof fetch>();

function browserRequest(headers: Record<string, string>) {
  return new Request("https://app.openseo.so/api/auth/sign-up/email", {
    headers: { cookie: "_fbp=fb.1.1.1", ...headers },
  });
}

beforeEach(() => {
  kv.clear();
  fetchMock.mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", fetchMock);
});

describe("captureMetaSignup", () => {
  it("sends nothing to Meta without advertising permission", () => {
    // An EU visitor who hasn't opted in, and a US visitor sending GPC. The
    // full set of region and saved-choice cases is in privacy-choices.test.ts.
    captureMetaSignup(browserRequest({ "cf-ipcountry": "DE" }));
    captureMetaSignup(browserRequest({ "cf-ipcountry": "US", "sec-gpc": "1" }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports the signup once advertising is allowed", () => {
    // EU visitor who opted in to advertising but not partner referrals.
    captureMetaSignup(
      browserRequest({
        "cf-ipcountry": "DE",
        cookie: "_fbp=fb.1.1.1; openseo_privacy=a0.d0.m1",
      }),
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("captureMetaSetupStep", () => {
  it("reports each of an organization's steps once, from a fixed page", async () => {
    const request = browserRequest({ "cf-ipcountry": "US" });
    await captureMetaSetupStep(MetaSetupEvent.WebsiteAdded, "org-1", request);
    await captureMetaSetupStep(MetaSetupEvent.WebsiteAdded, "org-1", request);
    await captureMetaSetupStep(MetaSetupEvent.AgentConnected, "org-1", request);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]?.body).toEqual(
      expect.stringMatching(
        /"event_name":"WebsiteAdded".*"event_source_url":"https:\/\/app\.openseo\.so\/onboarding"/,
      ),
    );
  });

  it("still reports the step later when advertising wasn't allowed at first", async () => {
    await captureMetaSetupStep(
      MetaSetupEvent.WebsiteAdded,
      "org-1",
      browserRequest({ "cf-ipcountry": "US", "sec-gpc": "1" }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    await captureMetaSetupStep(
      MetaSetupEvent.WebsiteAdded,
      "org-1",
      browserRequest({ "cf-ipcountry": "US" }),
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("captureMetaCheckoutStart", () => {
  it("reports the click at the plan's price", () => {
    captureMetaCheckoutStart(
      browserRequest({ "cf-ipcountry": "US" }),
      "pro-plan",
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]?.body).toEqual(
      expect.stringMatching(/"event_name":"InitiateCheckout".*"value":30\b/),
    );
  });

  it("sends nothing for a YC deal or without advertising permission", () => {
    captureMetaCheckoutStart(
      browserRequest({ "cf-ipcountry": "US" }),
      "yc-plan",
    );
    captureMetaCheckoutStart(
      browserRequest({ "cf-ipcountry": "US", "sec-gpc": "1" }),
      "pro-plan",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("captureMetaPurchase", () => {
  it("reports a pinned checkout's subscription at the plan's price", async () => {
    await pinMetaCheckout("org-1", browserRequest({ "cf-ipcountry": "US" }));
    await captureMetaPurchase("org-1", "pro-plan");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]?.body).toEqual(
      expect.stringMatching(/"event_name":"Purchase".*"value":30\b/),
    );
  });

  it("doesn't report YC deal subscriptions", async () => {
    await pinMetaCheckout("org-1", browserRequest({ "cf-ipcountry": "US" }));
    await captureMetaPurchase("org-1", "yc-plan");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends nothing when the buyer's last checkout didn't allow advertising", async () => {
    await pinMetaCheckout("org-1", browserRequest({ "cf-ipcountry": "US" }));
    await pinMetaCheckout(
      "org-1",
      browserRequest({ "cf-ipcountry": "US", "sec-gpc": "1" }),
    );
    await captureMetaPurchase("org-1", "base-plan");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
