// Downloads a file from a URL and writes it to a local path.
// Usage: node self-host/scripts/download-archive.mjs <url> <output-path>

import { writeFileSync } from "node:fs";

const [url, outputPath] = process.argv.slice(2);

if (!url || !outputPath) {
  console.error(
    "Usage: node self-host/scripts/download-archive.mjs <url> <output-path>",
  );
  process.exit(1);
}

const res = await fetch(url);
if (!res.ok) {
  throw new Error("Failed to download source archive: " + String(res.status));
}

writeFileSync(outputPath, Buffer.from(await res.arrayBuffer()));
