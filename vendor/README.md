# Vendored Every App packages

- `everyapp-0.3.0.tgz`: the Every App CLI 0.3.0
- `every-app-sdk-0.3.0.tgz`: the Every App SDK 0.3.0

Both were packed with `pnpm pack` from the Every App repository
(https://github.com/every-app/every-app) at commit 3ed0f4dc (2026-10-24).
`package.json` points at them (`file:vendor/...`), so a clone of this
repository installs and builds on its own, with no Every App checkout beside
it. The Release workflow (`.github/workflows/release.yml`) builds from them too.
The CLI vendored here runs `pnpm dev`, `pnpm everyapp db migrate` and
`pnpm everyapp release`; deploying to a Gateway is done from an Every App
checkout (`pnpm everyapp install <this repository's URL>` there, or
`pnpm everyapp deploy` here with that checkout's CLI), because a deploy also
updates the Gateway from its source.

To refresh them, from an Every App checkout:

```sh
pnpm pack-for-app ../openseo
```

It rebuilds the SDK and the CLI, packs both here, rewrites `package.json` and
runs `pnpm install`; commit `vendor/`, `package.json` and `pnpm-lock.yaml`.
To work against a live Every App checkout instead, point the two specifiers
at it (`link:../every-app/packages/cli`, `link:../every-app/packages/sdk`)
and don't commit that.
