// Loads this app's secrets from Doppler into process.env before the app's own code runs:
//   node --import ./scripts/doppler-env.mjs dist/index.js
// Railway holds only DOPPLER_TOKEN, a read-only Doppler service token for this app's config; the keys
// themselves live in Doppler (owner decision, 2026-10-23, after the Railway breach). Without
// DOPPLER_TOKEN (CI, a machine with its own .env) this does nothing. Values are never printed.
//
// Options:
//   DOPPLER_ONLY=NAME1,NAME2  load only these names (a build step that needs one key, a service sharing a config)
//   DOPPLER_OPTIONAL=1        if Doppler can't be read, warn and carry on instead of exiting
//   DOPPLER_KEEP=NAME1        for these names a value already set (in Railway) wins over Doppler's: a key
//                             whose new value waits for a machine outside Railway to switch over
//
// For a shell entrypoint, run it as a script: `exports="$(node scripts/doppler-env.mjs --export)" || exit 1`
// then `eval "$exports"`. It prints `export NAME='value'` lines for the shell (its own log goes to stderr).
const exportMode =
  process.argv.includes("--export") &&
  /doppler-env\.mjs$/.test(process.argv[1] || "");
const log = exportMode ? console.error : console.log;
const token = process.env.DOPPLER_TOKEN;
const only = process.env.DOPPLER_ONLY
  ? new Set(
      process.env.DOPPLER_ONLY.split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    )
  : null;
const optional = process.env.DOPPLER_OPTIONAL === "1";
const keep = new Set(
  (process.env.DOPPLER_KEEP || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

if (token) {
  const url =
    "https://api.doppler.com/v3/configs/config/secrets/download?format=json";
  let secrets;
  let failure = "";
  for (let attempt = 1; attempt <= 4 && !secrets; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status === 401 || res.status === 403) {
        failure = `Doppler refused DOPPLER_TOKEN (HTTP ${res.status})`;
        break;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      secrets = await res.json();
    } catch (err) {
      failure = err instanceof Error ? err.message : String(err);
      if (attempt < 4)
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * 2 ** (attempt - 1)),
        );
    }
  }
  if (!secrets && optional) {
    console.warn(
      `[doppler] could not load secrets (${failure}); continuing without them (DOPPLER_OPTIONAL).`,
    );
  } else if (!secrets) {
    // Fail closed: started without its keys, an app runs on its defaults (a default session secret, no auth).
    console.error(
      `[doppler] could not load secrets (${failure}); not starting without them.`,
    );
    process.exit(1);
  } else {
    const names = Object.keys(secrets).filter(
      (name) => !name.startsWith("DOPPLER_") && (!only || only.has(name)),
    );
    const kept = names.filter(
      (name) => keep.has(name) && process.env[name] !== undefined,
    );
    const loaded = names.filter((name) => !kept.includes(name));
    for (const name of loaded) process.env[name] = secrets[name];
    log(
      `[doppler] loaded ${loaded.length} secrets from ${secrets.DOPPLER_PROJECT}/${secrets.DOPPLER_CONFIG}${only ? " (DOPPLER_ONLY)" : ""}${kept.length ? `; kept Railway's ${kept.join(", ")} (DOPPLER_KEEP)` : ""}`,
    );
    if (exportMode) {
      for (const name of loaded)
        process.stdout.write(
          `export ${name}='${String(secrets[name]).replace(/'/g, "'\\''")}'\n`,
        );
    }
  }
}
