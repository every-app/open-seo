import type { WorkflowStep } from "cloudflare:workers";
import { expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));

import {
  forOrganization,
  gatewayCallFor,
} from "@/server/lib/gateway-attribution";
import { pgStep } from "./pgStep";

it("carries the organization a Workflow names around run() into each step", async () => {
  // The engine runs a step's body in an execution context of its own, after
  // run() has moved on: hold the body and run it outside the scope.
  const bodies: (() => Promise<unknown>)[] = [];
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- pgStep only calls do()
  const step = {
    do: (_name: string, ...rest: (() => Promise<unknown>)[]) => {
      const body = rest.at(-1);
      if (!body) throw new Error("expected a body");
      bodies.push(body);
      return Promise.resolve(null);
    },
  } as unknown as WorkflowStep;

  await forOrganization("org_a", async () => {
    await pgStep(step, "with-config", { retries: { limit: 0, delay: 1 } }, () =>
      Promise.resolve(gatewayCallFor({ EVERYAPP_SHARED: "1" })),
    );
    await pgStep(step, "without-config", undefined, () =>
      Promise.resolve(gatewayCallFor({ EVERYAPP_SHARED: "1" })),
    );
  });

  const [withConfig, withoutConfig] = await Promise.all(
    bodies.map((body) => body()),
  );
  expect(bodies).toHaveLength(2);
  const background = { background: true, organizationId: "org_a" };
  expect(withConfig).toEqual(background);
  expect(withoutConfig).toEqual(background);
});
