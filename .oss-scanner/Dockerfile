# Build image for Anthropic's OSS Scanner (https://red.anthropic.com/oss-scanner/).
# The scanner builds this with network access, then analyses the image offline on
# a 2-CPU / 8 GB machine, so everything a test or a local run needs is fetched here.
#
# Full node:22 (not slim) on purpose: the scanner's own layer apt-installs curl,
# git, python3 and bash on top, and workerd wants a real CA trust store.
FROM node:22

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# CI=true: non-interactive pnpm/vitest output, same as GitHub Actions.
ENV CI=true

# Same pnpm as package.json's packageManager and deploy/docker/Dockerfile.
RUN corepack enable && corepack prepare pnpm@10.30.1 --activate

# Scanner contract: the checkout lives inside the image, at /src.
COPY . /src
WORKDIR /src

# App deps (dev deps included) plus the website workspace, whose free-tool
# protection tests exercise the FreeToolBudget Durable Object in workerd.
# workerd ships as an npm optional dependency, so it is already offline-ready.
RUN pnpm install --frozen-lockfile
RUN pnpm --dir web install --frozen-lockfile

# Same as CI: vite build (the eager-bundle guard) and tsc --noEmit. The repo
# .npmrc raises the V8 heap for the ~7400-module SSR build. Output lands in
# dist/ (app worker + client) and dist/open_seo_audit/ (site-audit worker).
RUN pnpm run build

# Website: type check and build the marketing site, as CI does. The build
# prerenders pages by fetching them from a throwaway Vite preview server. Inside
# a BuildKit RUN step `localhost` resolves to ::1 first, so that server binds
# IPv6 while Vite reports the 127.0.0.1 URL and every fetch is refused;
# ipv4first keeps both on 127.0.0.1.
RUN NODE_OPTIONS=--dns-result-order=ipv4first pnpm --dir web run types:check \
    && NODE_OPTIONS=--dns-result-order=ipv4first pnpm --dir web run build

# Run the unit tests so a broken image shows up in the build log, but do not let
# a failing test abort the build.
RUN pnpm run test:ci || echo "WARNING: pnpm run test:ci reported failures; see output above"
RUN pnpm --dir web run test:protection || echo "WARNING: web test:protection reported failures; see output above"
