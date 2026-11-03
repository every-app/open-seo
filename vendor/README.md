# vendor/: an unreleased EveryApp SDK and CLI

Packed by `pnpm pack-for-app <this app> --vendor` from an EveryApp checkout
at aaddc038d2b791272a69949862697bb0fce64ddd (branch `HEAD`) on 2026-11-03:

- `everyapp`: `file:vendor/everyapp-0.3.0-aaddc038.tgz`
- `@every-app/sdk`: `file:vendor/every-app-sdk-0.3.0-aaddc038.tgz`

To take a newer commit, run the same command again from the checkout.
Once a release carries what this app needs, go back to npm:

```sh
pnpm pack-for-app <this app> --npm <version>
```

which pins both packages to that version and deletes this folder.
