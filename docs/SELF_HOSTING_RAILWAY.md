# Railway Self-Hosting

Deploy OpenSEO on [Railway](https://railway.com) using the published Docker image (`ghcr.io/every-app/open-seo`) with a persistent volume.

> **Community template:** [railway.com/deploy/openseo](https://railway.com/deploy/openseo) is a community Railway listing (Social Freak Network), not an official every-app product. Review the template overview before deploying.

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/openseo)

## What you get

- Image: `ghcr.io/every-app/open-seo` (semver tags)
- Volume at `/app/.wrangler` for local D1/KV/R2 state (same path as Docker Compose)
- No separate Postgres or Redis service

## Requirements

- A DataForSEO API key (see [`DATAFORSEO_API_KEY.md`](./DATAFORSEO_API_KEY.md)) — Base64 of `email:password`
- Enough RAM for a multi-minute cold start (~4GB+ recommended; the image migrates and builds on start)

## Security

Railway Docker deploys use `AUTH_MODE=local_noauth` (no application login), same as [`SELF_HOSTING_DOCKER.md`](./SELF_HOSTING_DOCKER.md). Anyone who can reach the public URL can use the app as admin. Only expose it on a private network, behind your own auth proxy, or accept that risk for personal use.

## After deploy

1. Set `DATAFORSEO_API_KEY` when prompted (or in service variables).
2. Confirm the public domain targets Railway’s `PORT` (often `8080`).
3. Optionally enable **Image Auto Updates** (minor + patch) under service Settings → Source so new OpenSEO releases are pulled automatically.
4. Prefer release tags over floating `:latest` if you want update-on-release behavior.

## Related

- Local Docker: [`SELF_HOSTING_DOCKER.md`](./SELF_HOSTING_DOCKER.md)
- Cloudflare: [`SELF_HOSTING_CLOUDFLARE.md`](./SELF_HOSTING_CLOUDFLARE.md)
- Template: https://railway.com/deploy/openseo
