import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  SIGN_UP_EMAIL_REFUSED_CODE,
  SIGN_UP_EMAIL_REFUSED_MESSAGE,
} from "@/shared/sign-up-email";
import { assertSignUpEmailAccepted } from "./disposable-email";

const SIGN_UP_FORM = "/sign-up/email";

function mailHosts(...hosts: string[]) {
  return Response.json({
    Status: 0,
    Answer: hosts.map((host) => ({ type: 15, data: `10 ${host}.` })),
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  vi.mocked(fetch).mockResolvedValue(mailHosts("aspmx.l.google.com"));
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it.each([
  ["the public list", "someone@Yopmail.com"],
  ["our own names", "someone@33Mail.com"],
])(
  "refuses a domain on %s without looking up its mail host",
  async (_, email) => {
    await expect(
      assertSignUpEmailAccepted(email, SIGN_UP_FORM),
    ).rejects.toThrow(SIGN_UP_EMAIL_REFUSED_MESSAGE);
    expect(fetch).not.toHaveBeenCalled();
  },
);

it("refuses an unlisted domain whose mail a throwaway host receives, sending the lookup the domain alone", async () => {
  vi.mocked(fetch).mockResolvedValue(mailHosts("mx.smtp.is"));

  await expect(
    assertSignUpEmailAccepted("someone@minted-today.example", SIGN_UP_FORM),
  ).rejects.toThrow(SIGN_UP_EMAIL_REFUSED_MESSAGE);
  expect(vi.mocked(fetch).mock.calls[0][0]).toBe(
    "https://cloudflare-dns.com/dns-query?name=minted-today.example&type=MX",
  );
});

it.each(["aspmx.l.google.com", "mx.notsmtp.is"])(
  "accepts an unlisted domain with mail at %s",
  async (mailHost) => {
    vi.mocked(fetch).mockResolvedValue(mailHosts(mailHost));

    await expect(
      assertSignUpEmailAccepted("someone@agency.example", SIGN_UP_FORM),
    ).resolves.toBeUndefined();
  },
);

it.each([
  ["times out", () => Promise.reject(new DOMException("", "TimeoutError"))],
  ["answers an HTTP error", () => new Response(null, { status: 503 })],
  ["answers a DNS failure", () => Response.json({ Status: 2 })],
])("lets the sign-up through when the lookup %s", async (_, answer) => {
  vi.mocked(fetch).mockImplementation(async () => answer());

  await expect(
    assertSignUpEmailAccepted("someone@agency.example", SIGN_UP_FORM),
  ).resolves.toBeUndefined();
  expect(console.warn).toHaveBeenCalledWith(
    "sign_up:email_check",
    expect.objectContaining({
      outcome: "mail_host_lookup_failed",
      domain: "agency.example",
    }),
  );
});

it("refuses a Google sign-up with the code /auth-error explains", async () => {
  await expect(
    assertSignUpEmailAccepted("someone@euploading.com", "/callback/:id"),
  ).rejects.toThrow(SIGN_UP_EMAIL_REFUSED_CODE);
});
