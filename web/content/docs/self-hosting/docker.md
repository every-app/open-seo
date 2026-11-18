---
title: "Docker Self-Hosting"
description: "Run OpenSEO on your own server or computer with Docker Compose and a prebuilt image."
---

Run OpenSEO on your own server or computer with Docker Compose. The image is prebuilt, so OpenSEO is ready a few seconds after it starts. You sign in with email and password accounts: the first visitor creates the administrator's account and teammates join from invitation links.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Docker Compose), with at least 4 GiB of memory for Docker
- A [DataForSEO API key](/docs/self-hosting#dataforseo-api-key-setup)

## Quickstart

```bash
git clone https://github.com/every-app/open-seo.git
cd open-seo
export COMPOSE_FILE=deploy/standalone/compose.yaml
cp deploy/standalone/.env.example deploy/standalone/.env
```

In `deploy/standalone/.env`, set `STORAGE_SECRET_KEY` to a unique random value (for example the output of `openssl rand -hex 32`) and `DATAFORSEO_API_KEY` to your key. Then start OpenSEO:

```bash
docker compose pull
docker compose up -d
docker compose logs -f init
```

Wait for `OpenSEO initialized and ready.`, open `http://localhost:3001` and create the administrator's account. Registration closes once that account exists, so create it before you put the installation on the internet.

To add teammates, invite them from Team settings. The app copies an invitation link; send it yourself, since there is no email delivery.

## Coolify, Portainer and Dokploy

`deploy/standalone/compose.yaml` reads no other files from the repository, so you can paste it into a platform that runs Compose files, with the variables from `deploy/standalone/.env.example`. Point the platform's domain at the `web` service on port 80 and set `BETTER_AUTH_URL` to that `https://` address.

## Public HTTPS, updates and backups

Set `BETTER_AUTH_URL` to your public `https://` address and put an HTTPS reverse proxy in front of `127.0.0.1:3001`. To update, pull the new image and restart. The full guide covers both, plus backups, password resets and optional features: [Docker self-hosting guide on GitHub](https://github.com/every-app/open-seo/blob/main/docs/SELF_HOSTING_DOCKER.md).

AI Visibility uses your `DATAFORSEO_API_KEY` and sends tracked questions to DataForSEO. Set `OPENROUTER_API_KEY` for setup research, Prompt Research, and generated prompt suggestions. You pay providers directly; the app shows the collection cost before a check or schedule starts. Background answers and daily, weekly, or monthly tracking run on their own while the containers are up. See the [AI Visibility guide](/docs/ai-visibility).

## Without sign-in (advanced)

`AUTH_MODE=local_noauth` runs OpenSEO without sign-in, as one admin user. Use it only where the network already controls who can reach the app, such as Tailscale, a private network or your own authenticating proxy. See [Without sign-in](https://github.com/every-app/open-seo/blob/main/docs/SELF_HOSTING_DOCKER.md#without-sign-in-advanced) on GitHub.

## Running the older image?

The older single-container image (`ghcr.io/every-app/open-seo`) keeps getting updates, so nothing breaks. When you are ready, [move to this setup](https://github.com/every-app/open-seo/blob/main/docs/SELF_HOSTING_DOCKER.md#move-from-the-old-docker-image); your projects, keywords, rank history, audits and reports come with you. The older image's own instructions, including telemetry settings, are in the [older image guide](https://github.com/every-app/open-seo/blob/main/docs/SELF_HOSTING_DOCKER_LEGACY.md).
