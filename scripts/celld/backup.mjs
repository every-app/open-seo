import { execFileSync, spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";

const [command, directory] = process.argv.slice(2);
if (!["backup", "restore"].includes(command) || !directory)
  throw new Error(
    "Usage: node scripts/celld/backup.mjs backup|restore DIRECTORY",
  );
const root = resolve(directory);
const docker = (...args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
// The stack is defined in deploy/standalone; COMPOSE_FILE overrides it.
const composeFile =
  process.env.COMPOSE_FILE ??
  fileURLToPath(
    new URL("../../deploy/standalone/compose.yaml", import.meta.url),
  );
const compose = (...args) => docker("compose", "-f", composeFile, ...args);
const id = (service) => compose("ps", "-aq", service);
// The named volume behind a service mount. Restore binds it directly:
// --volumes-from would inherit runtime's read-only /config.
const volume = (service, path) =>
  docker(
    "inspect",
    "--format",
    `{{range .Mounts}}{{if eq .Destination "${path}"}}{{.Name}}{{end}}{{end}}`,
    id(service),
  );
async function hash(path) {
  const sum = createHash("sha256");
  for await (const part of createReadStream(path)) sum.update(part);
  return sum.digest("hex");
}
async function archive(service, path, file, restore = false) {
  const child = spawn(
    "docker",
    [
      "run",
      "--rm",
      "--network",
      "none",
      "-i",
      "-u",
      "0",
      ...(restore
        ? ["-v", `${volume(service, path)}:${path}`]
        : ["--volumes-from", `${id(service)}:ro`]),
      "--entrypoint",
      "tar",
      image,
      restore ? "-xzf" : "-czf",
      "-",
      "-C",
      path,
      ...(restore ? [] : ["."]),
    ],
    { stdio: ["pipe", "pipe", "inherit"] },
  );
  const completed = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Archive process exited ${code}`)),
    );
  });
  if (restore) {
    child.stdout.resume();
    await pipeline(createReadStream(file), child.stdin);
  } else {
    child.stdin.end();
    await pipeline(
      child.stdout,
      createWriteStream(file, { mode: 0o600, flags: "wx" }),
    );
  }
  await completed;
}
let image;
if (command === "backup") {
  await mkdir(root, { mode: 0o700 }); // refuse overwriting an existing backup
  if (!id("runtime") || !id("storage"))
    throw new Error("Create the Compose deployment first");
  image = docker("inspect", "--format", "{{.Image}}", id("runtime"));
  const running = compose("ps", "--services", "--status", "running")
    .split("\n")
    .filter((name) =>
      ["web", "runtime", "crawl-gateway", "storage"].includes(name),
    );
  compose("stop", "web", "crawl-gateway", "runtime", "storage");
  try {
    await archive("storage", "/data", `${root}/storage.tar.gz`);
    await archive("runtime", "/config", `${root}/config.tar.gz`);
    const manifest = {
      format: 1,
      celld: "0.5.1",
      image,
      createdAt: new Date().toISOString(),
      files: {},
    };
    for (const file of ["storage.tar.gz", "config.tar.gz"])
      manifest.files[file] = await hash(`${root}/${file}`);
    await writeFile(
      `${root}/manifest.json`,
      JSON.stringify(manifest, null, 2) + "\n",
      { mode: 0o600 },
    );
    console.log(
      `Backup complete: ${root}. Contains credentials; store it privately.`,
    );
  } finally {
    if (running.length) compose("start", ...running);
  }
} else {
  const manifest = JSON.parse(await readFile(`${root}/manifest.json`, "utf8"));
  if (manifest.format !== 1 || manifest.celld !== "0.5.1")
    throw new Error("Unsupported backup version");
  for (const file of ["storage.tar.gz", "config.tar.gz"])
    if ((await hash(`${root}/${file}`)) !== manifest.files[file])
      throw new Error(`Checksum mismatch: ${file}`);
  if (compose("ps", "--services", "--status", "running"))
    throw new Error("Restore requires a stopped, empty Compose deployment");
  compose("create", "--no-build", "storage", "runtime");
  image = docker("inspect", "--format", "{{.Image}}", id("runtime"));
  for (const [service, path] of [
    ["storage", "/data"],
    ["runtime", "/config"],
  ]) {
    docker(
      "run",
      "--rm",
      "--network",
      "none",
      "-u",
      "0",
      "--volumes-from",
      id(service),
      "--entrypoint",
      "sh",
      image,
      "-c",
      // Buckets, secrets and the deployment are visible entries; a fresh
      // RustFS volume only holds its hidden .rustfs system directory.
      `test -z "$(ls ${path})"`,
    );
  }
  await archive("storage", "/data", `${root}/storage.tar.gz`, true);
  await archive("runtime", "/config", `${root}/config.tar.gz`, true);
  console.log(
    "Restore complete. Set matching storage credentials and BETTER_AUTH_URL, then run docker compose up -d. Runtime cache is rebuilt from the restored bucket.",
  );
}
