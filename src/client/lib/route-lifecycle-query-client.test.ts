import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROUTES_DIR = join(process.cwd(), "src", "routes");
const LIFECYCLE_HOOKS = ["beforeLoad", "loader"] as const;

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts")
      ? [path]
      : [];
  });
}

/**
 * Drop commented-out code so a disabled option cannot be read as a live one.
 * Only whole-line `//` comments go, which keeps `https://` inside a string
 * intact — no route file starts a line with a URL.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line))
    .join("\n");
}

/**
 * Text of a route option's value, from the colon to the comma that closes it at
 * depth 0. Good enough for route definitions, which are plain object literals.
 */
function readOptionValue(source: string, option: string): string[] {
  const values: string[] = [];
  const property = new RegExp(`\\b${option}\\s*:`, "g");
  for (const match of source.matchAll(property)) {
    let depth = 0;
    let index = match.index + match[0].length;
    const start = index;
    while (index < source.length) {
      const char = source[index];
      if (char === "(" || char === "{" || char === "[") depth += 1;
      else if (char === ")" || char === "}" || char === "]") {
        if (depth === 0) break;
        depth -= 1;
      } else if (char === "," && depth === 0) break;
      index += 1;
    }
    values.push(source.slice(start, index));
  }
  return values;
}

describe("route lifecycle hooks and the shared query client", () => {
  // `beforeLoad` and `loader` run on the server for the initial document
  // request. `queryClient` is module scope, and a worker isolate reuses module
  // scope across requests, so a hook that touches it there either answers this
  // visitor from the previous request's rows (`ensureQueryData`) or leaves this
  // visitor's rows for the next one (`prefetchQuery`) — and the keys involved
  // carry no user id. Marking the route `ssr: false` keeps the hook in the
  // browser, where the cache is per-tab and that cannot happen.
  it("never touches the shared query client from a server-reachable hook", () => {
    const offenders: string[] = [];

    for (const file of routeFiles(ROUTES_DIR)) {
      const source = stripComments(readFileSync(file, "utf8"));
      // Read the declared option rather than searching the whole file, so
      // neither a passing mention of `ssr: false` nor a commented-out one
      // exempts a route that does not actually declare it.
      const declaresClientOnly = readOptionValue(source, "ssr").some(
        (value) => value.trim() === "false",
      );
      if (declaresClientOnly) continue;

      for (const hook of LIFECYCLE_HOOKS) {
        for (const value of readOptionValue(source, hook)) {
          if (/\b\w*[qQ]ueryClient\b/.test(value)) {
            offenders.push(
              `${file.replace(`${process.cwd()}/`, "")} — ${hook} reaches the shared queryClient`,
            );
          }
        }
      }
    }

    expect(
      offenders,
      "Mark the route ssr: false, or move the cache work into the component, so the hook cannot run on the server",
    ).toEqual([]);
  });

  it("extracts the hook body it is asserting on", () => {
    // Guards the parser itself: a silently-empty extraction would make the
    // assertion above pass no matter what the routes do.
    const source = `createFileRoute("/x")({
  validateSearch: (s) => ({ step: Number(s.step) }),
  beforeLoad: async ({ params }) => {
    await queryClient.ensureQueryData(opts(params.id));
  },
  component: X,
})`;
    const [value] = readOptionValue(source, "beforeLoad");
    expect(value).toContain("queryClient.ensureQueryData");
    expect(value).not.toContain("component: X");
    expect(readOptionValue(source, "loader")).toEqual([]);
  });

  it("only honours an ssr option that is actually declared", () => {
    // The exemption is the guard's only escape hatch. A commented-out option is
    // the shape that matters: it reads exactly like the real one, comma and all.
    const clientOnly = (source: string) =>
      readOptionValue(stripComments(source), "ssr").some(
        (value) => value.trim() === "false",
      );

    expect(
      clientOnly(`createFileRoute("/x")({
  ssr: false,
  component: X,
})`),
    ).toBe(true);
    expect(
      clientOnly(`createFileRoute("/x")({
  // ssr: false,
  component: X,
})`),
    ).toBe(false);
    expect(
      clientOnly(`createFileRoute("/x")({
  /* ssr: false, */
  component: X,
})`),
    ).toBe(false);
  });
});
