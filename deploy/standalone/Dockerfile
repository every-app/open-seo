# The application is compiled once, at image build time. Runtime has no Vite,
# Wrangler, Miniflare, package manager, or node_modules.
FROM node:22-bookworm-slim@sha256:48e4b67d85f87bd551df43704e24d252f56cc5f8e9718841aace50f19948f0f9 AS build
WORKDIR /build
RUN corepack enable && corepack prepare pnpm@10.30.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile
COPY . .
# The client bundle inlines AUTH_MODE at build time (vite envPrefix) only as a
# fallback: the server publishes the mode chosen at initialization
# (scripts/celld/runtime/configure.mjs) on every page it serves.
ENV VITE_SHOW_DEVTOOLS=false AUTH_MODE=password
RUN pnpm build:standalone

FROM node:22-bookworm-slim@sha256:48e4b67d85f87bd551df43704e24d252f56cc5f8e9718841aace50f19948f0f9 AS runtime
ARG TARGETARCH
ARG CELLD_VERSION=0.5.1
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && \
    rm -rf /var/lib/apt/lists/* /usr/local/lib/node_modules /opt/yarn* && \
    rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
RUN case "$TARGETARCH" in \
      arm64) triple=aarch64-unknown-linux-gnu; checksum=375c7cd9446d61e6ee2c263d6be792650153ffd7cd562b2c4b6b644776b4494e;; \
      amd64) triple=x86_64-unknown-linux-gnu; checksum=b9f205da7365ef4a8b2e16f1f48065a8ddd5cda366edc258fea12a097d8ab4b7;; \
      *) exit 1;; \
    esac && \
    curl -fsSL "https://github.com/denoland/celld/releases/download/v${CELLD_VERSION}/celld-${triple}.gz" -o /tmp/celld.gz && \
    echo "$checksum  /tmp/celld.gz" | sha256sum -c - && \
    gunzip /tmp/celld.gz && install -m 0755 /tmp/celld /usr/local/bin/celld && rm /tmp/celld
COPY --from=build /build/dist/celld /opt/openseo
COPY deploy/standalone/init.sh deploy/standalone/run.sh deploy/standalone/nginx.conf /opt/standalone/
COPY scripts/celld/runtime/admin.mjs scripts/celld/runtime/configure.mjs scripts/celld/runtime/crawl-gateway.mjs scripts/celld/runtime/import.mjs /opt/standalone/
RUN mkdir -p /config /data /web-config && chown -R node:node /config /data /web-config
USER node
# celld stops any handler that runs past CELLD_HANDLER_BUDGET_S, including a
# workflow's run of steps (denoland/celld#299). Workflows pause after two
# minutes of steps (src/server/workflows/yieldingStep.ts), so the budget only
# has to outlast that plus the longest step timeout, 10 minutes. With celld's
# default of 300 s, a slow step was stopped before its own timeout could fail it.
ENV CELLD_WATCH=/data CELLD_IDLE_EVICT_S=300 CELLD_HANDLER_BUDGET_S=900
CMD ["sh", "/opt/standalone/run.sh"]
