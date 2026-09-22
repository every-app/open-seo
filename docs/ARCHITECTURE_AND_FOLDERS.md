# DGTL SEO architecture and folders

## Tenant model

- A client company is one Better Auth organization.
- A client website is one project owned by that organization.
- Client users reach only organizations where they have a membership.
- DGTL platform administrators are a separate platform role configured with
  `SUPER_ADMIN_EMAILS`; client roles never grant cross-client access.
- Every project query remains scoped by `organizationId`.

## Folder structure

The repository already separates browser, server, storage, and routing concerns.
Keep that shape and add each business capability as a vertical feature slice:

```text
src/
  client/
    components/                 shared visual components
    features/
      dashboard/
        dgtl-overview/          overview composition, panels, and demo data
      super-admin/              super-admin screens and client-side state
      clarity/                  Clarity connection and report UI
      ga4/                      Google Analytics UI
    layout/                     application shell and navigation
  server/
    features/
      super-admin/
        access.ts               platform authorization rule
        repositories/           database reads and writes
        services/               business workflows
      clarity/
        repositories/           saved connector and snapshots
        services/               Clarity API adapter and normalization
      onboarding/
        repositories/           onboarding persistence and storage encoding
        services/               onboarding state and completion workflows
    auth/                       identity and organization authorization
    lib/                        infrastructure shared by server features
  serverFunctions/              validated client-to-server entry points
  routes/                       thin TanStack Router files
  db/
    *.schema.ts                 SQLite/D1 schema
    pg/*.schema.ts              matching PostgreSQL schema
  shared/                       browser/server contracts and constants
  types/schemas/                Zod schemas at request/data boundaries
docs/                           architecture and operating guides
```

Routes should compose pages, server functions should validate input and enforce
access, services should implement workflows, and repositories should own SQL.
Avoid putting SQL in route components or placing browser code in server feature
folders. Do not reorganize unrelated existing features in one large move;
migrate them only when they are being changed.

## Super-admin access

Local development automatically exposes the dashboard at `/admin/clients`.
For hosted deployments, set a comma-separated allowlist:

```env
SUPER_ADMIN_EMAILS=admin@dgtl.lk,operations@dgtl.lk
```

The server checks the signed-in email on every super-admin request. Hiding the
sidebar link is only a convenience; the server function remains the security
boundary.

## Recommended next slices

1. Client creation: create an organization, create its first project, and invite
   the verified client administrator in one audited workflow.
2. Staff assignments: add explicit DGTL staff-to-client memberships instead of
   relying only on global administrator access.
3. Client detail: connection health for GA4, GSC, DataForSEO, and Clarity.
4. Audit log: record who created, invited, suspended, or changed a client.
5. Clarity storage: encrypted server-side token, project mapping, scheduled
   summary snapshots, and retention limits.
