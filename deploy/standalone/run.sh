#!/bin/sh
set -eu
# celld's Linux builds use jemalloc built for 4 KiB pages, and abort on a
# kernel with larger ones, such as a Raspberry Pi 5's (denoland/celld#298).
page_size=$(getconf PAGESIZE)
if [ "$page_size" -gt 4096 ]; then
  echo "This kernel uses ${page_size}-byte memory pages; the OpenSEO runtime needs 4 KiB pages. On a Raspberry Pi 5, add kernel=kernel8.img to /boot/firmware/config.txt and reboot. See docs/SELF_HOSTING_DOCKER.md#troubleshooting." >&2
  exit 1
fi
# SHA-256 of an empty body: RustFS requires x-amz-content-sha256 on every
# SigV4 request and this image's curl does not add it on its own.
EMPTY_SHA256=e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
status=$(curl -sS -o /tmp/create-bucket-response -w '%{http_code}' --aws-sigv4 "aws:amz:${AWS_REGION}:s3" --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY" -H "x-amz-content-sha256: $EMPTY_SHA256" -X PUT "$S3_ENDPOINT/$CELLD_BUCKET")
case "$status" in 200|409) ;; *) echo "Bucket initialization failed (HTTP $status)" >&2; exit 1;; esac
exec celld --listen 0.0.0.0:8080 --internal-listen 127.0.0.1:8081
