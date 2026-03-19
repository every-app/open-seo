# Project scoping for server functions

## Status

Accepted

## Context

TanStack Start server functions do not know which route called them, so they cannot infer the active project from the URL.

We used to keep the selected project in session state and read it indirectly from middleware. That made project scope implicit and caused drift between the current page, the current request, and other open tabs.

## Decision

Project-scoped server functions must accept `projectId` in their input.

Global server-function middleware now always resolves the authenticated user and organization. If the payload includes `projectId`, that same global middleware loads the project for the current organization and adds it to server-function context.

Function-level middleware is still used for type narrowing:

- `requireAuthenticatedContext` guarantees authenticated context is present.
- `requireProjectContext` guarantees `context.project` is present for project-scoped handlers.

In practice:

- `organizationId` comes from global middleware.
- `projectId` comes from explicit input.
- `context.project` exists only when the request included a valid `projectId`.
- handlers use `context.project.id`, not session-backed current-project state.

## Rationale

Explicit `projectId` matches how server functions actually work: the request payload, not the route, defines the target resource.

This gives us:

- request-level project scope
- correct multi-tab behavior
- authorization tied to the current request
- simpler, more testable handlers

## Consequences

- Project-scoped server functions should validate `projectId` in input and use `requireProjectContext`.
- Organization-scoped server functions should use authenticated context only.
- Global middleware is the single place that resolves auth, organization, and optional project context.
- The session is no longer the source of truth for the selected project.
- Hosted mode may still apply product-level feature defaults after project access is resolved. For example, backlinks access can be treated as platform-enabled in hosted deployments, but the request must still be scoped to a project first.
