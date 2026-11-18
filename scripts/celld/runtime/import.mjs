import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve, basename } from "node:path";
const directory = resolve(process.argv[2] ?? "/import");
const manifestBytes = await readFile(join(directory, "manifest.json"));
const manifest = JSON.parse(manifestBytes);
if (manifest.format !== 1) throw new Error("Unsupported import format");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const entries = [...manifest.tables, ...manifest.sam, ...manifest.artifacts];
for (const entry of entries) {
  if (basename(entry.file) !== entry.file)
    throw new Error("Invalid export filename");
  if (sha(await readFile(join(directory, entry.file))) !== entry.sha256)
    throw new Error(`Export checksum mismatch: ${entry.file}`);
}
const { OPENSEO_OPERATOR_SECRET } = JSON.parse(
  await readFile("/config/secrets.json", "utf8"),
);
const headers = {
  "content-type": "application/json",
  "x-openseo-operator-secret": OPENSEO_OPERATOR_SECRET,
};
const endpoint = "http://127.0.0.1:8080/api/standalone/import";
async function command(body) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error(
      `Import ${body.command} failed (${response.status}): ${await response.text()}`,
    );
  return response.json();
}
await command({ command: "begin", manifestHash: sha(manifestBytes) });
for (const entry of manifest.tables)
  await command({
    command: "rows",
    ...JSON.parse(await readFile(join(directory, entry.file), "utf8")),
  });
for (const entry of manifest.sam)
  await command({
    command: "sam",
    sessionId: entry.sessionId,
    ...JSON.parse(await readFile(join(directory, entry.file), "utf8")),
  });
for (const entry of manifest.artifacts) {
  const response = await fetch(`${endpoint}?artifact=1`, {
    method: "POST",
    headers: {
      "x-openseo-operator-secret": OPENSEO_OPERATOR_SECRET,
      "x-artifact-sha256": entry.sha256,
      "x-artifact-key": encodeURIComponent(entry.key),
      "x-artifact-metadata": JSON.stringify({
        httpMetadata: entry.httpMetadata,
        customMetadata: entry.customMetadata,
      }),
    },
    body: await readFile(join(directory, entry.file)),
  });
  if (!response.ok)
    throw new Error(`Artifact import failed (${response.status})`);
}
const counts = await command({ command: "counts" });
const expected = {};
for (const entry of manifest.tables)
  expected[entry.table] = (expected[entry.table] ?? 0) + entry.count;
for (const [table, count] of Object.entries(expected))
  if (counts[table] !== count)
    throw new Error(
      `Count mismatch for ${table}: expected ${count}, found ${counts[table]}`,
    );
const conversations = {};
for (const entry of manifest.sam) {
  const tables = (conversations[entry.sessionId] ??= {});
  tables[entry.table] = (tables[entry.table] ?? 0) + entry.count;
}
for (const [sessionId, tables] of Object.entries(conversations)) {
  const actual = await command({ command: "sam-counts", sessionId });
  for (const [table, count] of Object.entries(tables))
    if (actual[table] !== count)
      throw new Error(`Conversation count mismatch: ${sessionId}/${table}`);
}
await command({ command: "finish" });
console.log(
  JSON.stringify(
    {
      databaseRows: expected,
      conversationRows: manifest.sam.reduce((n, t) => n + t.count, 0),
      artifacts: manifest.artifacts.length,
      omitted: manifest.omitted,
    },
    null,
    2,
  ),
);
console.log(
  "Import complete. Restart runtime to load conversation histories, then reset the imported account password. Reconnect Google and MCP clients.",
);
