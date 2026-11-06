import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { DefaultCatchBoundary } from "./client/components/DefaultCatchBoundary";
import { NotFound } from "./client/components/NotFound";
import { reloadForNewDeploy } from "./client/lib/reloadForNewDeploy";

// After a deploy replaces the hashed chunks, dynamic imports in already-open
// tabs 404 ("Importing a module script failed." / "Unexpected token '<'").
// Reload to pick up the new build. Registered at module scope, not in a
// component, so it also catches chunks that fail while hydration is still in
// progress. Vite only emits this event in builds — exercise it via
// `vite preview` or a deploy, never `vite dev`.
//
// preventDefault() makes the failed import resolve to undefined, so the lazy
// route throws "reading 'component'" before the reload lands; the reload
// stops error capture so that side effect isn't reported.
if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", (event) => {
    if (reloadForNewDeploy()) event.preventDefault();
  });
}

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    defaultPreload: "intent",
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: () => <NotFound />,
    scrollRestoration: true,
  });

  return router;
}
