import { describe, expect, it } from "vitest";
import { classify } from "./sources";

describe("classify", () => {
  it("maps t.co to X / social", () => {
    expect(classify({ referrerDomain: "t.co" })).toMatchObject({
      source: "X",
      channel: "Organic Social",
    });
  });

  it("maps Google to organic search", () => {
    expect(classify({ referrerDomain: "google.co.in" })).toMatchObject({
      source: "Google",
      channel: "Organic Search",
    });
  });

  it("recognises AI assistants, including utm_source=chatgpt.com", () => {
    expect(
      classify({ referrerDomain: null, utmSource: "chatgpt.com" }),
    ).toMatchObject({
      source: "ChatGPT",
      channel: "AI",
    });
  });

  it("lets ref/utm tags win over the referrer", () => {
    expect(
      classify({ referrerDomain: "google.com", ref: "producthunt" }),
    ).toMatchObject({ source: "Product Hunt" });
    expect(
      classify({ referrerDomain: null, ref: "my-newsletter-42" }),
    ).toMatchObject({ source: "my-newsletter-42", channel: "Referral" });
  });

  it("detects paid and email by medium", () => {
    expect(
      classify({ referrerDomain: "google.com", utmMedium: "cpc" }).channel,
    ).toBe("Paid");
    expect(
      classify({
        referrerDomain: null,
        utmSource: "buttondown",
        utmMedium: "email",
      }).channel,
    ).toBe("Email");
  });

  it("falls back to Direct", () => {
    expect(classify({ referrerDomain: null })).toMatchObject({
      source: "Direct/None",
      channel: "Direct",
    });
  });

  it("does not confuse mail.google.com with Google search", () => {
    expect(classify({ referrerDomain: "mail.google.com" })).toMatchObject({
      source: "Gmail",
      channel: "Email",
    });
  });
});
