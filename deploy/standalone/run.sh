#!/bin/sh
set -eu
# SHA-256 of an empty body: RustFS requires x-amz-content-sha256 on every
# SigV4 request and this image's curl does not add it on its own.
EMPTY_SHA256=e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
status=$(curl -sS -o /tmp/create-bucket-response -w '%{http_code}' --aws-sigv4 "aws:amz:${AWS_REGION}:s3" --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY" -H "x-amz-content-sha256: $EMPTY_SHA256" -X PUT "$S3_ENDPOINT/$CELLD_BUCKET")
case "$status" in 200|409) ;; *) echo "Bucket initialization failed (HTTP $status)" >&2; exit 1;; esac
exec celld --listen 0.0.0.0:8080 --internal-listen 127.0.0.1:8081
