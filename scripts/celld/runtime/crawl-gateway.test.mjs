import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isPublicAddress,
  resolveTarget,
  createGateway,
  upstreamHeaders,
} from "./crawl-gateway.mjs";
test("blocks loopback, private, metadata, mapped IPv4 and special ranges", () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.1.1",
    "100.64.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "::ffff:a00:1",
    "fc00::1",
    "fe80::1",
    "64:ff9b::a00:1",
    "2002:7f00:1::",
  ])
    assert.equal(isPublicAddress(address), false, address);
  for (const address of ["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"])
    assert.equal(isPublicAddress(address), true, address);
});
test("fails closed on mixed DNS answers and pins the validated answer", async () => {
  await assert.rejects(
    resolveTarget("https://example.com", async () => [
      { address: "1.1.1.1", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]),
  );
  const target = await resolveTarget("https://example.com", async () => [
    { address: "1.1.1.1", family: 4 },
  ]);
  assert.deepEqual(target.address, { address: "1.1.1.1", family: 4 });
  for (const url of [
    "http://127.1",
    "http://2130706433",
    "http://[::ffff:7f00:1]",
    "http://example.com:9000",
    "file:///etc/passwd",
    "http://user:pass@example.com",
  ])
    await assert.rejects(resolveTarget(url));
});
test("requires credentials and rejects localhost without contacting it", async () => {
  const secret = "a".repeat(64);
  const server = createGateway(secret).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(base)).status, 404);
    assert.equal(
      (
        await fetch(base, {
          headers: {
            "x-crawl-secret": secret,
            "x-crawl-url": "http://127.0.0.1:9000",
          },
        })
      ).status,
      403,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("forwards HTTPS crawler signatures without leaking application credentials", () => {
  const headers = {
    signature: "sig1=:test:",
    "signature-input": "sig1=()",
    "signature-agent": '\"https://shopify.com\"',
    "x-crawl-secret": "gateway-secret",
    authorization: "Bearer app-token",
    cookie: "app-session",
  };
  const https = upstreamHeaders(headers, new URL("https://store.example"));
  assert.equal(https.signature, headers.signature);
  for (const name of ["x-crawl-secret", "authorization", "cookie"])
    assert.equal(https[name], undefined);
  const http = upstreamHeaders(headers, new URL("http://store.example"));
  for (const name of ["signature", "signature-input", "signature-agent"])
    assert.equal(http[name], undefined);
});
