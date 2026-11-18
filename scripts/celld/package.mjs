import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const destination = resolve(process.argv[2] ?? "dist/celld");
// Build artifacts only. Never copy .dev.vars, generated Wrangler variables,
// node_modules, or operator credentials into a distributable image.
await mkdir(destination, { recursive: true });
await cp("dist/server/index.js", `${destination}/index.js`);
await rm(`${destination}/assets`, { recursive: true, force: true });
await mkdir(`${destination}/assets`, { recursive: true });
for (const name of await readdir("dist/server/assets")) {
  if (name.endsWith(".wasm")) {
    await cp(`dist/server/assets/${name}`, `${destination}/assets/${name}`);
  }
}
await rm(`${destination}/public`, { recursive: true, force: true });
await cp("dist/client", `${destination}/public`, {
  recursive: true,
  filter: (path) =>
    ![".dev.vars", "wrangler.json", ".assetsignore"].includes(
      path.split("/").at(-1),
    ),
});
await cp("drizzle/sqlite", `${destination}/drizzle`, { recursive: true });
const config = JSON.parse(await readFile("wrangler.standalone.json", "utf8"));
config.main = "index.js";
config.no_bundle = true;
config.assets = { directory: "public" };
await writeFile(
  `${destination}/wrangler.json`,
  `${JSON.stringify(config, null, 2)}\n`,
);
console.log(`Packaged standalone application in ${destination}`);
