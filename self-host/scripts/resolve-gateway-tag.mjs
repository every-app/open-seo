// Resolves the gateway release tag to use for the selfhost Docker build.
// If GATEWAY_RELEASE_TAG is set, prints it and exits.
// Otherwise fetches the latest release tag from the GitHub API.

const tag = process.env.GATEWAY_RELEASE_TAG;
if (tag) {
  process.stdout.write(tag);
  process.exit(0);
}

const res = await fetch(
  "https://api.github.com/repos/every-app/every-app/releases/latest",
);
if (!res.ok) {
  throw new Error("Failed to resolve latest release: " + String(res.status));
}

const parsed = await res.json();
if (!parsed.tag_name) {
  throw new Error("Missing tag_name in latest release payload");
}

process.stdout.write(parsed.tag_name);
