import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server";

// Durable Object classes must be named exports of the Worker entry, which is
// why this file replaces the default `@tanstack/react-start/server-entry` as
// `main` in wrangler.jsonc (same arrangement as the app's src/server.ts).
export { BacklinkCheckBudget } from "./lib/backlink-budget";

export default {
  fetch: createStartHandler(defaultStreamHandler),
};
