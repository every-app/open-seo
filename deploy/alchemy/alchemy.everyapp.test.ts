import { describe, expect, it, vi } from "vitest";
import { bindEveryAppGateway } from "./alchemy.everyapp.ts";

const SETTINGS =
  "https://api.cloudflare.com/client/v4/accounts/account/workers/scripts";

function cloudflareApi(bindings: Record<string, { name: string }[]>) {
  const patches: { url: string; settings: unknown }[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString();
    const worker = url.slice(SETTINGS.length + 1, -"/settings".length);
    if (init?.method === "PATCH") {
      const form = init.body;
      if (!(form instanceof FormData)) throw new Error("expected a form");
      const settings = form.get("settings");
      if (!(settings instanceof Blob)) throw new Error("expected settings");
      patches.push({ url, settings: JSON.parse(await settings.text()) });
      return Response.json({ success: true, result: {} });
    }
    const current = bindings[worker];
    if (!current) {
      return Response.json(
        { success: false, errors: [{ code: 10007, message: "not found" }] },
        { status: 404 },
      );
    }
    return Response.json({
      success: true,
      result: {
        bindings: current.map(({ name }) => ({ name, type: "plain_text" })),
      },
    });
  });
  return { fetch, patches };
}

const options = {
  accountId: "account",
  apiToken: "token",
  platformOrganizationId: "org_platform",
};

describe("bindEveryAppGateway", () => {
  it("binds both Workers to the gateway as the shared app, keeping their other bindings", async () => {
    const api = cloudflareApi({
      "open-seo-everyapp": [{ name: "KV" }, { name: "EVERY_APP_GATEWAY" }],
      "open-seo-everyapp-audit": [{ name: "R2" }],
    });

    await bindEveryAppGateway({ ...options, fetch: api.fetch });

    const gateway = {
      type: "service",
      name: "EVERY_APP_GATEWAY",
      service: "every-app-gateway",
      entrypoint: "AppGateway",
      // The audit Worker is the app to the gateway, as the SDK binds it.
      props: {
        organizationId: "org_platform",
        appId: "openseo",
        workerName: "open-seo-everyapp",
      },
    };
    expect(api.patches).toEqual([
      {
        url: `${SETTINGS}/open-seo-everyapp/settings`,
        settings: {
          bindings: [{ type: "inherit", name: "KV" }, gateway],
        },
      },
      {
        url: `${SETTINGS}/open-seo-everyapp-audit/settings`,
        settings: {
          bindings: [{ type: "inherit", name: "R2" }, gateway],
        },
      },
    ]);
  });

  it("stops at a Worker the stage hasn't deployed", async () => {
    const api = cloudflareApi({});

    await expect(
      bindEveryAppGateway({ ...options, fetch: api.fetch }),
    ).rejects.toThrow(/open-seo-everyapp\/settings failed \(404\): not found/);
    expect(api.patches).toEqual([]);
  });
});
