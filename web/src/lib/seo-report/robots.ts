// Reading a robots.txt, to ask before a page is read (read-page.ts).

/** One "User-agent" block: who it is for, and its allow and disallow lines in order. */
type Group = { agents: string[]; rules: [kind: string, pattern: string][] };

/** The file's groups. Consecutive "User-agent" lines share one group. */
function groupsOf(text: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const match = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!match) continue;
    const key = (match[1] ?? "").toLowerCase();
    const value = (match[2] ?? "").trim();
    if (key === "user-agent") {
      if (!lastWasAgent || !current) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (current && (key === "allow" || key === "disallow"))
        current.rules.push([key, value]);
    }
  }
  return groups;
}

/**
 * Whether a rule's path pattern matches: `*` is any run of characters and a
 * final `$` ends the match; otherwise the pattern matches from the start of
 * the path. Each literal stretch is looked for once, left to right, so a
 * pattern written to be slow (many `*`) costs no more than any other. The
 * file comes from the site being reported on.
 */
function matches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const parts = (anchored ? pattern.slice(0, -1) : pattern).split("*");
  const first = parts[0] ?? "";
  if (!path.startsWith(first)) return false;
  let at = first.length;
  const last = parts.length - 1;
  for (let index = 1; index <= last; index += 1) {
    const part = parts[index] ?? "";
    if (anchored && index === last)
      return path.length - part.length >= at && path.endsWith(part);
    const found = path.indexOf(part, at);
    if (found === -1) return false;
    at = found + part.length;
  }
  return !anchored || at === path.length;
}

/** The allow and disallow lines that apply to one crawler, in order. */
export type RobotsRules = [kind: string, pattern: string][];

// More rules than any real site lists for one crawler. Every rule is tried
// against every address, so a file is held to a number that stays cheap.
const MAX_RULES = 5_000;

/**
 * The rules a robots.txt has for `agent` (its name as written in robots.txt,
 * lower case): those of the groups naming it, or when none does, of the "*"
 * groups. Null when there are too many to check cheaply. Parse a file once
 * and ask `rulesAllow` about each address.
 */
export function robotsRules(text: string, agent: string): RobotsRules | null {
  const groups = groupsOf(text);
  const named = groups.filter((group) => group.agents.includes(agent));
  const ours = named.length
    ? named
    : groups.filter((group) => group.agents.includes("*"));
  const rules = ours.flatMap((group) => group.rules);
  return rules.length > MAX_RULES ? null : rules;
}

/**
 * Whether the rules let a crawler read `path` (a path with its query,
 * starting with "/"). Among the rules that match the path the longest wins,
 * and an allow wins a tie. A path no rule matches is allowed.
 */
export function rulesAllow(rules: RobotsRules, path: string) {
  let allowed = true;
  let longest = -1;
  for (const [kind, pattern] of rules) {
    if (!pattern || !matches(pattern, path)) continue;
    const wins =
      pattern.length > longest ||
      (pattern.length === longest && kind === "allow");
    if (wins) {
      allowed = kind === "allow";
      longest = pattern.length;
    }
  }
  return allowed;
}
