import * as Config from "effect/Config";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import stack from "./alchemy.run.ts";

// Resolves the Alchemy stack for a stage without touching Cloudflare: the
// resource constructors record their props instead of creating anything, and
// the env file is a plain map. The snapshots are what each stage would deploy
// (resource names, bindings, vars and which values become secrets), so a
// change to one stage's output shows up as a snapshot diff. A deliberate
// change to wrangler.jsonc or a stage updates them with `vitest -u`.

type MockResource = {
  type: string;
  id: string | undefined;
  props: unknown;
  removal: "retain" | "destroy";
  workerName?: string;
  policyId?: string;
  aud?: string;
  url?: { as: () => string | undefined };
  bind?: (binding: string, props: unknown) => Effect.Effect<void>;
};

const harness = vi.hoisted(() => ({
  stage: "",
  // Resource effects not yet run (bound in a Worker's env), by identity.
  unrun: new WeakMap<object, MockResource>(),
  // Resources the stack yielded, in order.
  yielded: [] as MockResource[],
}));

vi.mock("alchemy", async () => {
  const { Effect: E } = await import("effect");
  return {
    Stage: E.sync(() => harness.stage),
    Stack: (name: string, _options: unknown, program: unknown) => ({
      name,
      program,
    }),
    RemovalPolicy: {
      retain:
        (condition = true) =>
        (effect: object) => {
          const resource = harness.unrun.get(effect);
          if (resource) resource.removal = condition ? "retain" : "destroy";
          return effect;
        },
    },
  };
});

vi.mock("alchemy/Cloudflare", async () => {
  const { Effect: E } = await import("effect");
  const resource =
    (type: string) =>
    (id?: string, props?: Record<string, unknown>): object => {
      const record: MockResource = { type, id, props, removal: "destroy" };
      if (type === "Cloudflare.Worker") {
        const name = typeof props?.name === "string" ? props.name : undefined;
        record.workerName = name;
        record.url = { as: () => (props?.url === false ? undefined : name) };
        // Prod binds its Hyperdrive config by ID after the upload.
        record.bind = () => E.void;
      }
      if (type === "Cloudflare.Access.Policy") record.policyId = `policy-${id}`;
      if (type === "Cloudflare.Access.Application") record.aud = `aud-${id}`;
      const effect = E.sync(() => {
        harness.yielded.push(record);
        return record;
      });
      harness.unrun.set(effect, record);
      return effect;
    };
  return {
    providers: () => "cloudflare-providers",
    state: () => "cloudflare-state",
    CloudflareEnvironment: E.succeed(E.succeed({ accountId: "account" })),
    D1: { Database: resource("Cloudflare.D1.Database") },
    R2: { Bucket: resource("Cloudflare.R2.Bucket") },
    KV: { Namespace: resource("Cloudflare.KV.Namespace") },
    Hyperdrive: { Connection: resource("Cloudflare.Hyperdrive.Connection") },
    Access: {
      Policy: resource("Cloudflare.Access.Policy"),
      Application: resource("Cloudflare.Access.Application"),
    },
    Worker: resource("Cloudflare.Worker"),
    Browser: () => resource("Cloudflare.Browser")(),
    DurableObject: resource("Cloudflare.DurableObject"),
    Workflow: resource("Cloudflare.Workflow"),
    RateLimit: resource("Cloudflare.RateLimit"),
  };
});

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the mocked Stack returns its program
const program = (stack as unknown as { program: Effect.Effect<unknown> })
  .program;

function resolveStage(stage: string, env: Record<string, string>) {
  harness.stage = stage;
  harness.yielded.length = 0;
  const provider = ConfigProvider.fromEnv({ env });
  const withEnv = <A, E>(effect: Effect.Effect<A, E>) =>
    Effect.runSync(
      effect.pipe(
        Effect.provideService(ConfigProvider.ConfigProvider, provider),
      ),
    );
  const output = withEnv(program);

  // What Alchemy would send: literals as plain vars, Config values resolved
  // from the env file (bound as secrets), and bound resources by props.
  const describeValue = (value: unknown): unknown => {
    if (typeof value !== "object" || value === null) return value;
    const unrun = harness.unrun.get(value);
    if (unrun) return { resource: describeResource(unrun) };
    const yielded = harness.yielded.find((resource) => resource === value);
    if (yielded) return { ref: `${yielded.type}:${yielded.id}` };
    if (Config.isConfig(value)) {
      return {
        config: describeValue(
          withEnv(
            Effect.gen(function* () {
              return yield* value;
            }),
          ),
        ),
      };
    }
    if (Redacted.isRedacted(value)) return { redacted: Redacted.value(value) };
    if (Array.isArray(value)) return value.map(describeValue);
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, describeValue(entry)]),
    );
  };
  const describeResource = ({ type, id, removal, props }: MockResource) => ({
    type,
    id,
    removal,
    props: describeValue(props),
  });

  return {
    resources: harness.yielded.map(describeResource),
    output: describeValue(output),
  };
}

const workerProps = z.object({
  name: z.string(),
  env: z.record(z.string(), z.unknown()),
});

/** Each Worker's env in a resolved stage, by Worker name. */
const workerEnvs = (plan: ReturnType<typeof resolveStage>) =>
  Object.fromEntries(
    plan.resources
      .filter((resource) => resource.type === "Cloudflare.Worker")
      .map((resource) => {
        const { name, env } = workerProps.parse(resource.props);
        return [name, env];
      }),
  );

const WORKERS_SUBDOMAIN = "example.workers.dev";

describe("alchemy.run.ts stages", () => {
  it("hosted-prod adopts the live openseo.so resources", () => {
    expect(
      resolveStage("hosted-prod", {
        AUTH_MODE: "hosted",
        DATABASE_PROVIDER: "postgres",
        BETTER_AUTH_URL: "https://app.openseo.so",
        BETTER_AUTH_SECRET: "auth-secret",
        DATAFORSEO_API_KEY: "dataforseo-key",
        AUTUMN_SECRET_KEY: "autumn-key",
        GOOGLE_CLIENT_ID: "google-client",
        GOOGLE_CLIENT_SECRET: "google-secret",
        HYPERDRIVE_ID: "hyperdrive-prod",
      }),
    ).toMatchSnapshot();
  });

  it("selfhost provisions its own Access gate", () => {
    expect(
      resolveStage("selfhost", {
        WORKERS_SUBDOMAIN,
        TEAM_DOMAIN: "https://team.cloudflareaccess.com",
        ACCESS_ALLOWED_EMAILS: "owner@example.com, teammate@example.com",
        DATAFORSEO_API_KEY: "dataforseo-key",
      }),
    ).toMatchSnapshot();
  });

  it("a preview runs hosted mode on stage-suffixed resources", () => {
    expect(
      resolveStage("pr-123", {
        WORKERS_SUBDOMAIN,
        AUTH_MODE: "hosted",
        BETTER_AUTH_SECRET: "auth-secret",
        DATAFORSEO_API_KEY: "dataforseo-key",
      }),
    ).toMatchSnapshot();
  });

  describe("everyapp", () => {
    // A .env.everyapp as the runbook has it, plus keys that must not reach
    // either Worker even when an operator leaves them in the file.
    const everyAppEnv = {
      AUTH_MODE: "everyapp",
      EVERYAPP_IDENTITY_PUBLIC_KEYS:
        '["-----BEGIN PUBLIC KEY-----\\nMIIB\\n-----END PUBLIC KEY-----\\n"]',
      HYPERDRIVE_ORIGIN_HOST: "everyapp.pg.example.com",
      HYPERDRIVE_ORIGIN_DATABASE: "openseo",
      HYPERDRIVE_ORIGIN_USER: "openseo",
      HYPERDRIVE_ORIGIN_PASSWORD: "db-password",
      DATAFORSEO_API_KEY: "dataforseo-key",
      CONTEXT_API_KEY: "context-key",
      OPENROUTER_API_KEY: "openrouter-key",
      AUTUMN_SECRET_KEY: "autumn-key",
      GOOGLE_CLIENT_SECRET: "google-secret",
      EVERY_APP_ORG_ID: "org_pinned",
    };

    it("deploys the first-party Workers behind the gateway", () => {
      const plan = resolveStage("everyapp", everyAppEnv);
      expect(plan).toMatchSnapshot();

      const envs = workerEnvs(plan);
      // The registry's names for the platform organization "Every App":
      // `everyapp register` binds no others.
      expect(Object.keys(envs)).toEqual([
        "every-everyapp-openseo--audit",
        "every-everyapp-openseo",
      ]);
      const app = envs["every-everyapp-openseo"];
      expect(app).toMatchObject({
        AUTH_MODE: "everyapp",
        DATABASE_PROVIDER: "postgres",
        DEPLOYMENT_TIER: "first_party",
        EVERYAPP_APP_ID: "openseo",
        EVERYAPP_AUDIENCE: "every-everyapp-openseo",
        EVERYAPP_IDENTITY_ISSUER: "https://app.everyapp.com",
        GATEWAY_URL: "https://app.everyapp.com",
        BETTER_AUTH_URL: "https://openseo.app.everyapp.com",
      });
      expect(plan.output).toEqual({ url: undefined });
      for (const env of Object.values(envs)) {
        // One Worker pair for every organization: each gateway call says
        // whose it is.
        expect(env.EVERYAPP_SHARED).toBe("1");
        expect(env.HYPERDRIVE).toMatchObject({
          resource: { props: { name: "open-seo-everyapp" } },
        });
        for (const name of [
          "DB",
          "OAUTH_KV",
          "EVERY_APP_ORG_ID",
          "DATAFORSEO_API_KEY",
          "CONTEXT_API_KEY",
          "OPENROUTER_API_KEY",
          "AUTUMN_SECRET_KEY",
          "GOOGLE_CLIENT_SECRET",
          "BETTER_AUTH_SECRET",
        ]) {
          expect(env).not.toHaveProperty(name);
        }
      }
    });

    it("takes the Worker name the gateway's registry gives another platform organization key", () => {
      const envs = workerEnvs(
        resolveStage("everyapp", {
          ...everyAppEnv,
          EVERYAPP_WORKER_NAME: "every-everyapp2-openseo",
        }),
      );
      expect(Object.keys(envs)).toEqual([
        "every-everyapp2-openseo--audit",
        "every-everyapp2-openseo",
      ]);
      expect(envs["every-everyapp2-openseo"]).toMatchObject({
        EVERYAPP_AUDIENCE: "every-everyapp2-openseo",
      });
      expect(() =>
        resolveStage("everyapp", {
          ...everyAppEnv,
          EVERYAPP_WORKER_NAME: "open-seo-everyapp",
        }),
      ).toThrow(/EVERYAPP_WORKER_NAME/);
    });

    it("refuses to deploy without the gateway's identity key", () => {
      expect(() =>
        resolveStage("everyapp", {
          ...everyAppEnv,
          EVERYAPP_IDENTITY_PUBLIC_KEYS: "",
        }),
      ).toThrow(/EVERYAPP_IDENTITY_PUBLIC_KEYS/);
    });

    it("pairs AUTH_MODE=everyapp with the everyapp stage only", () => {
      expect(() =>
        resolveStage("everyapp", { ...everyAppEnv, AUTH_MODE: "hosted" }),
      ).toThrow(/Set AUTH_MODE=everyapp/);
      expect(() =>
        resolveStage("pr-123", {
          WORKERS_SUBDOMAIN,
          AUTH_MODE: "everyapp",
          DATAFORSEO_API_KEY: "dataforseo-key",
        }),
      ).toThrow(/only as the everyapp stage/);
    });
  });
});
