// The issue-id union comes straight from the OpenSEO audit engine so that
// every fixture's `expectedIssues` is type-checked against the real registry.
// Type-only import — erased at build time, never bundled into the Worker.
import type { AuditIssueType } from "../../../src/shared/audit-issues";

export type IssueId = AuditIssueType;

export interface FixtureContext {
  /** Absolute origin the site is being served from (localhost or badseo.dev). */
  origin: string;
  /** The request currently being handled. */
  request: Request;
  /** The path that matched this fixture (may be one of `extraPaths`). */
  path: string;
}

export interface Fixture {
  /** Canonical URL path, e.g. "/on-page/missing-title". Must start with "/". */
  path: string;
  /**
   * Extra paths that serve byte-identical output. Used to model duplicate
   * pages living at several URLs. Each extra path is also crawlable.
   */
  extraPaths?: string[];
  /** Grouping shown on the catalog page. */
  category: string;
  /** Short human name, e.g. "Missing <title> tag". */
  name: string;
  /** One-line description of the mistake, shown in the on-page test panel. */
  summary: string;
  /** Optional longer educational note (why it matters / how to fix). */
  lesson?: string;
  /**
   * The audit issue ids this page is engineered to trigger. This doubles as
   * the assertion source-of-truth for the e2e harness. An empty array means
   * "this page must come back clean" (used for healthy nav/support pages).
   */
  expectedIssues: IssueId[];
  /**
   * Support pages (redirect hops, deep-link waypoints) that exist only to make
   * another fixture reachable. They're crawled but not featured on the catalog
   * and the harness asserts they are clean.
   */
  support?: boolean;
  /** Include this path in sitemap.xml. Default true. */
  inSitemap?: boolean;
  /** Link to this page from the catalog. Default true (orphans set false). */
  linkedFromCatalog?: boolean;
  /** Produce the HTTP response. Full control over status, headers, timing. */
  handler: (ctx: FixtureContext) => Response | Promise<Response>;
}
