import { DurableObject, WorkflowEntrypoint } from "cloudflare:workers";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hex = (s) => Uint8Array.from(s.match(/../g), (b) => parseInt(b, 16));
const toHex = (buffer) =>
  [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

// `steps` one-second steps. With `pauseEveryMs`, a one-second sleep after
// that much work, as src/server/workflows/yieldingStep.ts does.
export class Steps extends WorkflowEntrypoint {
  async run(event, step) {
    const { steps, pauseEveryMs, hangingStep } = event.payload;
    if (hangingStep) {
      // A step that never settles must fail at its own timeout.
      return step
        .do(
          "hang",
          { retries: { limit: 0, delay: 1000 }, timeout: "2 seconds" },
          () => new Promise(() => {}),
        )
        .then(
          () => "settled",
          (error) => `rejected: ${error.message}`,
        );
    }
    let since = Date.now();
    for (let i = 1; i <= steps; i++) {
      if (pauseEveryMs && Date.now() - since > pauseEveryMs) {
        await step.sleep(`pause-${i}`, "1 second");
        since = Date.now();
      }
      await step.do(`step-${i}`, () => wait(1000).then(() => i));
    }
    return steps;
  }
}

// AuditScratchpad schedules its own cleanup with a storage alarm.
export class Alarm extends DurableObject {
  async fetch() {
    if ((await this.ctx.storage.get("fired")) === undefined)
      await this.ctx.storage.setAlarm(Date.now() + 1000);
    return Response.json((await this.ctx.storage.get("fired")) ?? false);
  }
  async alarm() {
    await this.ctx.storage.put("fired", true);
  }
}

// The AES-KW polyfill (src/server/standalone/aes-kw.ts) needs one AES block
// from AES-CBC with a zero IV, and a decrypt that checks PKCS#7 padding.
async function aesCbcBlock() {
  const key = await crypto.subtle.importKey(
    "raw",
    hex("000102030405060708090a0b0c0d0e0f"),
    "AES-CBC",
    false,
    ["encrypt", "decrypt"],
  );
  const iv = new Uint8Array(16);
  const out = await crypto.subtle.encrypt(
    { name: "AES-CBC", iv },
    key,
    hex("00112233445566778899aabbccddeeff"),
  );
  // FIPS-197 appendix C.1.
  if (toHex(out).slice(0, 32) !== "69c4e0d86a7b0430d8cdb78070b4c55a")
    return false;
  const bad = await crypto.subtle
    .decrypt({ name: "AES-CBC", iv }, key, new Uint8Array(32))
    .then(
      () => true,
      () => false,
    );
  return !bad;
}

async function nativeAesKw() {
  return crypto.subtle
    .importKey("raw", new Uint8Array(16), "AES-KW", false, ["wrapKey"])
    .then(
      () => true,
      () => false,
    );
}

const STARTS = {
  pausing: { steps: 25, pauseEveryMs: 4000 },
  continuous: { steps: 25 },
  timeout: { hangingStep: true },
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/start") {
      for (const [id, params] of Object.entries(STARTS))
        await env.STEPS.create({ id, params });
      await env.ALARM.get(env.ALARM.idFromName("a")).fetch(request);
      return new Response("started\n");
    }
    const status = async (id) => (await env.STEPS.get(id)).status();
    if (url.pathname === "/settled") {
      // Polled until the workflows that must finish have; reads only.
      const done = ["complete", "errored"];
      const pausing = await status("pausing");
      const timeout = await status("timeout");
      return Response.json(
        done.includes(pausing.status) && done.includes(timeout.status),
      );
    }
    const continuous = await status("continuous");
    let terminated = continuous.status;
    if (terminated === "running") {
      await (await env.STEPS.get("continuous")).terminate();
      terminated = (await status("continuous")).status;
    }
    const timeout = await status("timeout");
    return Response.json({
      required: {
        "a sleep starts a fresh handler budget":
          (await status("pausing")).status === "complete",
        "terminate stops an instance":
          terminated === "terminated" || continuous.status === "complete",
        "a hanging step fails at its timeout": String(
          timeout.output,
        ).startsWith("rejected"),
        "storage alarms fire": await (
          await env.ALARM.get(env.ALARM.idFromName("a")).fetch(request)
        ).json(),
        "AES-CBC gives single AES blocks": await aesCbcBlock(),
      },
      upstream: {
        // When this turns true, yieldingStep.ts is no longer needed.
        "steps past the budget continue (denoland/celld#299)":
          continuous.status === "complete",
        // When this turns true, aes-kw.ts is no longer needed.
        "native AES-KW (denoland/celld#295)": await nativeAesKw(),
      },
    });
  },
};
