# LedgerPe OpenSEO self-host runbook

## Feasibility summary
This host can run a localhost-only OpenSEO deployment alongside Hermes, but it should be treated as a conservative co-hosted service.

Current host facts at planning time:
- OS: Ubuntu 22.04.5 LTS x86_64
- Instance type: t3.large
- CPU: 2 vCPU
- Memory: 7.6 GiB total, about 4.1 GiB available
- Swap: none
- Root disk: 58G total, 16G free
- Docker: 29.1.3
- Compose: legacy `docker-compose` 1.29.2
- Port 3001: free
- Existing localhost listener seen near target range: 127.0.0.1:8090

Implication:
- Feasible: yes
- Comfortable with guardrails: yes
- Ideal long-term if usage grows: not necessarily

Why it is feasible:
- Memory headroom is enough for a constrained single OpenSEO container.
- Port 3001 is currently free.
- Localhost binding avoids public exposure.
- Paid providers are disabled by default.

Why caution is warranted:
- t3.large is burstable and can hit CPU-credit constraints under sustained crawls/builds.
- There is no swap, so runaway memory spikes would be less forgiving.
- Free disk is adequate but not abundant once audit history accumulates.

## Deployment files
- Compose: `deployment/ledgerpe-open-seo.compose.yaml`
- Env template: `deployment/ledgerpe-open-seo.env.example`

## Safety properties
- Binds only to `127.0.0.1:${PORT}`
- Uses dedicated volume: `ledgerpe_open_seo_data`
- Uses dedicated network: `ledgerpe_open_seo_private`
- Telemetry disabled by default
- DataForSEO disabled by default
- Paid budget defaults to zero
- Conservative CPU and memory limits
- Log rotation enabled

## First launch procedure
1. Copy the env template:
   - `cp deployment/ledgerpe-open-seo.env.example deployment/ledgerpe-open-seo.env`
2. Fill only the minimum needed values:
   - set `BETTER_AUTH_SECRET`
   - leave DataForSEO blank and disabled
   - leave Google OAuth blank until ready
3. Validate config:
   - `docker-compose --env-file deployment/ledgerpe-open-seo.env -f deployment/ledgerpe-open-seo.compose.yaml config`
4. Pull image:
   - `docker-compose --env-file deployment/ledgerpe-open-seo.env -f deployment/ledgerpe-open-seo.compose.yaml pull`
5. Start service:
   - `docker-compose --env-file deployment/ledgerpe-open-seo.env -f deployment/ledgerpe-open-seo.compose.yaml up -d`
6. Verify health:
   - `docker ps`
   - `docker logs --tail=200 ledgerpe-open-seo`
   - `curl -I http://127.0.0.1:3001/`

## Stop / restart
- Stop:
  - `docker-compose --env-file deployment/ledgerpe-open-seo.env -f deployment/ledgerpe-open-seo.compose.yaml stop`
- Restart:
  - `docker-compose --env-file deployment/ledgerpe-open-seo.env -f deployment/ledgerpe-open-seo.compose.yaml restart`

## Backup
### Volume backup
```bash
mkdir -p ~/backups/ledgerpe-open-seo
TS=$(date +%Y%m%d-%H%M%S)
docker run --rm \
  -v ledgerpe_open_seo_data:/source:ro \
  -v ~/backups/ledgerpe-open-seo:/backup \
  alpine sh -lc 'cd /source && tar czf /backup/open-seo-$TS.tgz .'
```

## Restore
```bash
docker-compose --env-file deployment/ledgerpe-open-seo.env -f deployment/ledgerpe-open-seo.compose.yaml stop

docker run --rm \
  -v ledgerpe_open_seo_data:/target \
  -v ~/backups/ledgerpe-open-seo:/backup \
  alpine sh -lc 'cd /target && rm -rf ./* && tar xzf /backup/open-seo-YYYYMMDD-HHMMSS.tgz -C /target'
```
Then start the service again.

## Upgrade
1. Backup volume
2. Pull new image
3. `docker-compose ... up -d`
4. Verify localhost access and logs
5. If unhealthy, roll back to previous image tag and restore backup if needed

## Rollback
- Pin `OPEN_SEO_IMAGE` to the last known-good tag instead of `latest`
- Re-run `docker-compose ... up -d`
- If data migration broke behavior, restore the volume backup

## Operational notes
- Do not expose this deployment publicly in `local_noauth` mode.
- If browser access is needed later, put it behind an authenticated layer first.
- Keep competitor projects and owned-site projects separate.
- Start with modest crawl cadence to protect CPU credits.
