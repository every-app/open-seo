import { describe, expect, it, vi } from "vitest";
import { withoutCookies } from "./cookies";

describe("withoutCookies", () => {
  it("drops any Set-Cookie behind the gateway and keeps the rest of the response", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const headers = new Headers({ "content-type": "text/html" });
    headers.append("set-cookie", "better-auth.session_token=abc; Path=/");
    headers.append("set-cookie", "other=1");
    const response = withoutCookies(
      new Response("<p>hi</p>", { status: 200, headers }),
    );

    expect(response.headers.has("set-cookie")).toBe(false);
    expect(response.headers.get("content-type")).toBe("text/html");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("<p>hi</p>");
  });

  it("returns a response without cookies as it is", () => {
    const original = new Response("ok");
    expect(withoutCookies(original)).toBe(original);
  });
});
