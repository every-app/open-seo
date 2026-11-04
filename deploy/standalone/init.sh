#!/bin/sh
set -eu
umask 077
# Same check as run.sh: init runs celld too, and its log is the one people read.
page_size=$(getconf PAGESIZE)
if [ "$page_size" -gt 4096 ]; then
  echo "This kernel uses ${page_size}-byte memory pages; the OpenSEO runtime needs 4 KiB pages. On a Raspberry Pi 5, add kernel=kernel8.img to /boot/firmware/config.txt and reboot. See docs/SELF_HOSTING_DOCKER.md#troubleshooting." >&2
  exit 1
fi
# See run.sh: RustFS requires x-amz-content-sha256 on every SigV4 request.
EMPTY_SHA256=e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
node /opt/standalone/configure.mjs
# Nginx's site config ships in this image, so the Compose file needs no files
# beside it (platforms such as Coolify and Portainer take the file alone).
install -m 0644 /opt/standalone/nginx.conf /web-config/default.conf
ready=0
for attempt in $(seq 1 90); do
  if curl -fsS --aws-sigv4 "aws:amz:${AWS_REGION}:s3" --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY" -H "x-amz-content-sha256: $EMPTY_SHA256" -I "$S3_ENDPOINT/$CELLD_BUCKET" >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
[ "$ready" = 1 ] || { echo 'Runtime did not start' >&2; exit 1; }
celld deploy /config/app
ready=0
for attempt in $(seq 1 90); do
  if curl -fsS -X POST http://127.0.0.1:8081/reload >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
[ "$ready" = 1 ] || { echo 'Runtime did not load the deployment' >&2; exit 1; }
celld d1 migrations apply openseo-standalone /config/app
curl -fsS -X POST http://127.0.0.1:8081/reload >/dev/null
for attempt in $(seq 1 90); do
  if curl -fsS http://127.0.0.1:8080/api/health >/dev/null; then
    echo 'OpenSEO initialized and ready.'
    exit 0
  fi
  sleep 1
done
echo 'OpenSEO did not become ready; inspect runtime logs.' >&2
exit 1
