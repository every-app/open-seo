#!/bin/sh
# Checks that the standalone image's celld still behaves the way OpenSEO
# relies on (see worker.js). It runs `celld dev`, not the deployed setup with
# S3 storage, so it covers runtime behaviour, not storage. About a minute:
#   sh scripts/celld/conformance/conformance.sh [image]
# The default image is the published :latest; pass a locally built tag to
# check a celld bump before it ships.
set -eu
image=${1:-ghcr.io/every-app/open-seo-standalone:latest}
here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
cp "$here/wrangler.jsonc" "$here/worker.js" "$work/"
chmod -R a+rwX "$work"
name="openseo-conformance-$$"
trap 'docker rm -f "$name" >/dev/null 2>&1 || true; rm -rf "$work"' EXIT
# A 10 s handler budget makes the 25-second workflows cross it.
docker run -d --name "$name" -p 127.0.0.1::9876 -v "$work:/app" \
  -e CELLD_HANDLER_BUDGET_S=10 --entrypoint celld "$image" \
  dev /app --host 0.0.0.0 --port 9876 --no-watch >/dev/null
port=$(docker port "$name" 9876 | head -1 | sed 's/.*://')
started=
for _ in $(seq 1 30); do
  curl -fsS "http://127.0.0.1:$port/start" >/dev/null 2>&1 && started=1 && break
  sleep 1
done
[ -n "$started" ] || { docker logs "$name" >&2; echo "celld did not start the check Worker" >&2; exit 1; }
docker exec "$name" celld --version
# The 25-step workflows take about 30 s; allow two minutes on a slow host.
for _ in $(seq 1 60); do
  [ "$(curl -fsS "http://127.0.0.1:$port/settled")" = true ] && break
  sleep 2
done
result=$(curl -fsS "http://127.0.0.1:$port/result")
echo "$result" | node -e '
  const result = JSON.parse(require("fs").readFileSync(0, "utf8"));
  let failed = false;
  for (const [group, checks] of Object.entries(result))
    for (const [name, ok] of Object.entries(checks)) {
      console.log(`${ok ? "yes" : "no "}  ${group === "upstream" ? "(upstream) " : ""}${name}`);
      if (group === "required" && !ok) failed = true;
    }
  process.exit(failed ? 1 : 0);
'
