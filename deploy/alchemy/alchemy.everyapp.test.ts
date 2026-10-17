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
      "every-everyapp-openseo": [{ name: "KV" }, { name: "EVERY_APP_GATEWAY" }],
      "every-everyapp-openseo--audit": [{ name: "R2" }],
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
        workerName: "every-everyapp-openseo",
      },
    };
    expect(api.patches).toEqual([
      {
        url: `${SETTINGS}/every-everyapp-openseo/settings`,
        settings: {
          bindings: [{ type: "inherit", name: "KV" }, gateway],
        },
      },
      {
        url: `${SETTINGS}/every-everyapp-openseo--audit/settings`,
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
    ).rejects.toThrow(
      /every-everyapp-openseo\/settings failed \(404\): not found/,
    );
    expect(api.patches).toEqual([]);
  });

  it("names the URL and status when a failure's body isn't the API's JSON", async () => {
    const fetch = vi.fn(
      async () =>
        new Response("<html>502 Bad Gateway</html>", {
          status: 502,
          headers: { "content-type": "text/html" },
        }),
    );

    await expect(bindEveryAppGateway({ ...options, fetch })).rejects.toThrow(
      `Cloudflare API GET ${SETTINGS}/every-everyapp-openseo/settings failed (502): <html>502 Bad Gateway</html>`,
    );
  });

  it("binds the Workers named for another platform organization key", async () => {
    const api = cloudflareApi({
      "every-everyapp2-openseo": [],
      "every-everyapp2-openseo--audit": [],
    });

    const { workers, props } = await bindEveryAppGateway({
      ...options,
      workerName: "every-everyapp2-openseo",
      fetch: api.fetch,
    });

    expect(workers).toEqual([
      "every-everyapp2-openseo",
      "every-everyapp2-openseo--audit",
    ]);
    expect(props.workerName).toBe("every-everyapp2-openseo");
  });
});
