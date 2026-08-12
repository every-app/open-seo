# Railway Self-Hosting

Deploy OpenSEO on [Railway](https://railway.com) using the published Docker image (`ghcr.io/every-app/open-seo`) with a persistent volume, behind a password gate.

> **Community template:** [railway.com/deploy/openseo](https://railway.com/deploy/openseo) is a community Railway listing (Social Freak Network), not an official every-app product. Review the template overview before deploying.

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/openseo)

## What you get

- Image: `ghcr.io/every-app/open-seo` (semver tags)
- Volume at `/app/.wrangler` for local D1/KV/R2 state (same path as Docker Compose)
- No separate Postgres or Redis service
- A small **Gate** service in front of OpenSEO so the public URL requires a password

## Architecture

```text
Browser → Gate (public URL + SITE_PASSWORD) → OpenSEO (private networking only)
```

OpenSEO still uses `AUTH_MODE=local_noauth` (same as [`SELF_HOSTING_DOCKER.md`](./SELF_HOSTING_DOCKER.md)). The community template does not expose that URL publicly: visitors hit Gate first, enter `SITE_PASSWORD`, then get proxied to OpenSEO.

## Requirements

- A DataForSEO API key (see [`DATAFORSEO_API_KEY.md`](./DATAFORSEO_API_KEY.md)) — Base64 of `email:password`
- A site password (`SITE_PASSWORD` on Gate)
- Enough RAM for a multi-minute cold start (~4GB+ recommended; the image migrates and builds on start)

## After deploy

1. Set `DATAFORSEO_API_KEY` on the OpenSEO service.
2. Set `SITE_PASSWORD` on the Gate service.
3. Use the **Gate** public URL. Do not attach a public domain to OpenSEO.
4. Optionally enable **Image Auto Updates** (minor + patch) under OpenSEO Settings → Source.
5. Prefer release tags over floating `:latest` if you want update-on-release behavior.

Logout: `/__gate/logout` on the Gate URL.

## Related

- Local Docker: [`SELF_HOSTING_DOCKER.md`](./SELF_HOSTING_DOCKER.md)
- Cloudflare: [`SELF_HOSTING_CLOUDFLARE.md`](./SELF_HOSTING_CLOUDFLARE.md)
- Template: https://railway.com/deploy/openseo
