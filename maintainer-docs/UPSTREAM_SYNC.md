# Syncing with the origin codebase

SEOShark started from the OpenSEO codebase (`https://github.com/every-app/open-seo`,
MIT, copyright Ben Senescu). This is internal maintainer context; the product,
docs site and README do not mention it, and the one legal obligation is that
the MIT notice in `LICENSE` stays in every copy of the code.

## Pulling improvements

```sh
git remote add upstream https://github.com/every-app/open-seo.git
git fetch upstream --tags
git merge <tag>
```

Branding is confined to `src/shared/brand.ts`, `web/src/lib/brand.ts`, the
tokenized markdown templates, the plugin manifests and the env/deploy files,
so merges rarely conflict on product copy. Expect conflicts in:

- `docs/` and `web/content/` (rewritten here),
- the plugin directory (renamed to `plugins/seoshark/`),
- `.github/workflows/` (deploy gates changed to repository variables).

After a merge run `pnpm sync-plugin-skills`, `pnpm ci:check` and `pnpm test`,
and grep the diff for the origin product name and hosts before pushing.

## Contributing back

Fixes to the shared SEO engine (crawler, audit rules, MCP tools, data
providers) are cheapest to maintain when they also land in the origin
repository, so they do not need re-applying after each merge. Strip brand
values before opening a pull request there.
