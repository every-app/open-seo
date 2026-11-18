/**
 * Paths a site audit skips. A pattern is matched against a URL's path and
 * query string from the start, the way a robots.txt Disallow rule is:
 * `/blog/` skips everything under /blog/, `*` matches any run of characters,
 * and a trailing `$` pins the end of the URL.
 */
import { z } from "zod";

export const MAX_EXCLUDE_PATHS = 20;
const MAX_EXCLUDE_PATH_LENGTH = 200;

const excludePathSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_EXCLUDE_PATH_LENGTH, {
    error: `Each excluded path can be at most ${MAX_EXCLUDE_PATH_LENGTH} characters.`,
  })
  .refine((pattern) => /^[/*]\S*$/.test(pattern), {
    error: (issue) =>
      `"${String(issue.input)}" is not a valid path to exclude. Start it with / (for example /blog/) and leave out spaces.`,
  });

export const excludePathsSchema = z
  .array(excludePathSchema)
  .max(MAX_EXCLUDE_PATHS, {
    error: `You can exclude up to ${MAX_EXCLUDE_PATHS} paths.`,
  });

/** One pattern per line, as typed in the launch form. */
export function splitExcludePathsInput(input: string): string[] {
  return input
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

// Segment search instead of a regex built from user input: it is linear in
// the URL length, where `.*` chains backtrack.
function matchesPattern(pattern: string, target: string): boolean {
  const anchored = pattern.endsWith("$");
  const parts = (anchored ? pattern.slice(0, -1) : pattern).split("*");
  if (!target.startsWith(parts[0])) return false;
  let position = parts[0].length;
  for (let i = 1; i < parts.length; i++) {
    if (anchored && i === parts.length - 1) {
      return (
        target.length - parts[i].length >= position && target.endsWith(parts[i])
      );
    }
    const found = target.indexOf(parts[i], position);
    if (found === -1) return false;
    position = found + parts[i].length;
  }
  return !anchored || position === target.length;
}

/** The first pattern that excludes this URL, if any. */
export function findExcludingPath(
  patterns: readonly string[],
  url: string,
): string | undefined {
  if (patterns.length === 0) return undefined;
  let target: string;
  try {
    const parsed = new URL(url);
    target = parsed.pathname + parsed.search;
  } catch {
    return undefined;
  }
  return patterns.find((pattern) => matchesPattern(pattern, target));
}
