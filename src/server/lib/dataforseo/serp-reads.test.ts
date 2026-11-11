import { expect, it, vi } from "vitest";

vi.mock("@/server/lib/runtime-env", () => ({
  // AUTH_MODE unset: the deployment holds the DataForSEO key.
  getOptionalEnvValue: vi.fn(async () => undefined),
  getRequiredEnvValue: vi.fn(async () => "test-api-key"),
}));

import { postSerpReadTasks } from "@/server/lib/dataforseo/serp";

const query = { keyword: "seo tools", locationCode: 2840, languageCode: "en" };

/** Stubs task_post to answer with `tasks` and returns the posted read tasks. */
function stubTaskPost(tasks: object[]) {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ status_code: 20000, tasks }));
  vi.stubGlobal("fetch", fetchMock);
  return (): unknown => {
    const body = fetchMock.mock.calls[0][1]?.body;
    if (typeof body !== "string") throw new Error("Expected a string body");
    return JSON.parse(body);
  };
}

it("posts every read at high priority, bills them all, and returns only the accepted tasks", async () => {
  const posted = stubTaskPost([
    { id: "read-1", status_code: 20100, cost: 0.0012 },
    { id: "read-2", status_code: 40501, cost: 0.0012 },
    { id: "read-3", status_code: 20100, cost: 0.0012 },
  ]);

  const { data, billing } = await postSerpReadTasks(query);

  expect(data).toEqual(["read-1", "read-3"]);
  expect(billing.costUsd).toBeCloseTo(0.0036);
  const read: unknown = expect.objectContaining({ depth: 10, priority: 2 });
  expect(posted()).toEqual([read, read, read]);
});

it("posts finalUrls reads on the standard queue, whose results aren't goto-wrapped", async () => {
  const posted = stubTaskPost([{ id: "read-1", status_code: 20100 }]);

  await postSerpReadTasks({ ...query, finalUrls: true });

  expect(JSON.stringify(posted())).not.toContain("priority");
});
