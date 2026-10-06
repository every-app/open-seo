# Use the full Node image so workerd has a working CA trust store for outbound HTTPS.
FROM node:22

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.30.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

EXPOSE 3001

# Readiness probe against the unauthenticated setup/health endpoint. The long
# start period covers migrations plus the boot-time vite build (skipped when
# the previous start's build is still valid; see deploy/docker/docker-entrypoint.sh).
HEALTHCHECK --interval=30s --timeout=10s --start-period=300s --retries=3 \
  CMD node -e "var b=(process.env.OPEN_SEO_BASE_PATH||'').replace(/\\/$/,''); fetch('http://127.0.0.1:'+(process.env.PORT||3001)+b+'/api/health').then(function(r){process.exit(r.ok?0:1)}).catch(function(){process.exit(1)})"

# Startup (preflight, migrations, conditional build, serve) lives in
# deploy/docker/docker-entrypoint.sh. The repo .npmrc raises the V8 heap ceiling
# (node-options) so the ~7400-module SSR build doesn't OOM under Node's ~2GB
# default.
CMD ["sh", "deploy/docker/docker-entrypoint.sh"]
