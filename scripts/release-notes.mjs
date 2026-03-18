#!/usr/bin/env node

// @ts-check

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";

const argv = process.argv.slice(2);
const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;

const { values } = parseArgs({
  args: normalizedArgv,
  options: {
    from: { type: "string" },
    to: { type: "string" },
    draft: { type: "string" },
    repo: { type: "string" },
    help: { type: "boolean", short: "h", default: false },
  },
  allowPositionals: false,
});

if (values.help) {
  process.stdout.write(
    `Usage: pnpm release:notes -- [options]\n\nOptions:\n  --from <tag>     Starting git tag. Defaults to latest semver tag.\n  --to <ref>       Ending git ref. Defaults to main for the public repo, otherwise HEAD.\n  --draft <tag>    Create a draft GitHub release for the provided tag.\n  --repo <owner/repo>  Override GitHub repo slug for compare links and draft release.\n  -h, --help       Show this help message.\n`,
  );
  process.exit(0);
}

/** @param {readonly string[]} args */
function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

/** @param {readonly string[]} args */
function gh(args) {
  return execFileSync("gh", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/** @param {string} remoteName */
function getRemoteRepo(remoteName) {
  try {
    const remote = git(["remote", "get-url", remoteName]);
    const match = remote.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/);
    return match?.[1];
  } catch {
    return undefined;
  }
}

function getLatestSemverTag() {
  const tags = git(["tag", "--sort=-version:refname"])
    .split("\n")
    .map((tag) => tag.trim())
    .filter(Boolean);

  return tags.find((tag) =>
    /^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(tag),
  );
}

/** @typedef {{ major: number, minor: number, patch: number }} Semver */
/** @typedef {{ tag: string, version: Semver, source: "tag" | "release-notes" }} VersionCandidate */

/** @param {string} value */
function parseSemver(value) {
  const match = value.match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/);
  if (!match) return null;

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

/** @param {Semver} left @param {Semver} right */
function compareSemver(left, right) {
  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  return left.patch - right.patch;
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return Boolean(value) && typeof value === "object";
}

function getPackageVersion() {
  /** @type {unknown} */
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  if (!isRecord(packageJson)) return null;
  const version = packageJson.version;
  return typeof version === "string" ? version : null;
}

function getReleaseNoteVersions() {
  try {
    return readdirSync("release-notes").flatMap((name) => {
      const version = name.match(
        /^v(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)\.md$/,
      )?.[1];
      return version ? [version] : [];
    });
  } catch {
    return [];
  }
}

/** @param {string[]} versionValues @param {VersionCandidate["source"]} source */
function collectVersionCandidates(versionValues, source) {
  return versionValues.flatMap((value) => {
    const version = parseSemver(value);
    if (!version) return [];
    return [{ tag: source === "tag" ? value : `v${value}`, version, source }];
  });
}

function getDefaultFromTag() {
  /** @type {string | null} */
  const currentVersion = getPackageVersion();
  const parsedCurrentVersion = currentVersion
    ? parseSemver(currentVersion)
    : null;
  if (!parsedCurrentVersion) return getLatestSemverTag();

  const tagCandidates = collectVersionCandidates(
    git(["tag", "--sort=-version:refname"])
      .split("\n")
      .map((tag) => tag.trim())
      .filter(Boolean),
    "tag",
  );

  const releaseNoteCandidates = collectVersionCandidates(
    getReleaseNoteVersions(),
    "release-notes",
  );

  const candidates = [...tagCandidates, ...releaseNoteCandidates]
    .filter((entry) => compareSemver(entry.version, parsedCurrentVersion) < 0)
    .reduce((sorted, entry) => {
      const insertAt = sorted.findIndex(
        (candidate) => compareSemver(entry.version, candidate.version) > 0,
      );
      if (insertAt === -1) {
        sorted.push(entry);
      } else {
        sorted.splice(insertAt, 0, entry);
      }
      return sorted;
    }, /** @type {VersionCandidate[]} */ ([]));

  const bestVersion = candidates[0]?.tag;
  if (!bestVersion) return getLatestSemverTag();

  const matchingTag = tagCandidates.find((entry) => entry.tag === bestVersion);
  if (matchingTag) return matchingTag.tag;

  return getLatestSemverTag();
}

function getPreferredRepo() {
  return getRemoteRepo("public") ?? getRemoteRepo("origin");
}

/** @param {string | undefined} repo */
function getDefaultToRef(repo) {
  return repo === "every-app/open-seo" ? "main" : "HEAD";
}

/** @param {readonly string[]} rangeArgs */
function getCommitSubjects(rangeArgs) {
  const output = git([
    "log",
    "--no-merges",
    "--reverse",
    "--format=%s",
    ...rangeArgs,
  ]);
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/** @param {string} subject */
function stripPrefix(subject) {
  return subject
    .replace(/^(?:revert:\s*)?/i, "")
    .replace(/^(\w+)(\([^)]+\))?!?:\s*/i, "")
    .trim();
}

/** @param {string} text */
function sentenceCase(text) {
  if (!text) return text;
  return text[0].toUpperCase() + text.slice(1);
}

/**
 * @typedef {{ section: "Added" | "Improved" | "Fixed" | "Changed" | "Docs", text: string }} CommitEntry
 */

/** @param {string} subject @returns {CommitEntry | null} */
function classifyCommit(subject) {
  const lower = subject.toLowerCase();
  const match = subject.match(/^(\w+)(\([^)]+\))?!?:\s*(.+)$/i);
  const type = match?.[1]?.toLowerCase();

  if (["chore", "ci", "test", "build", "release"].includes(type ?? ""))
    return null;
  if (lower.startsWith("merge ")) return null;

  const text = sentenceCase(stripPrefix(subject));
  if (!text) return null;

  if (type === "feat") return { section: "Added", text };
  if (type === "fix") return { section: "Fixed", text };
  if (type === "docs") return { section: "Docs", text };
  if (type === "perf" || type === "refactor")
    return { section: "Improved", text };
  if (type === "style") return { section: "Changed", text };

  if (/^(add|introduce|create)\b/i.test(text))
    return { section: "Added", text };
  if (/^(fix|resolve|correct)\b/i.test(text)) return { section: "Fixed", text };
  if (/^(improve|speed up|reduce|refactor|support)\b/i.test(text))
    return { section: "Improved", text };
  if (/^(document|docs|explain)\b/i.test(text))
    return { section: "Docs", text };
  return { section: "Changed", text };
}

/** @param {{ from?: string, to: string, repo?: string }} options */
function buildNotes({ from, to, repo }) {
  const rangeArgs = from ? [`${from}..${to}`] : [to];
  const commits = getCommitSubjects(rangeArgs)
    .map(classifyCommit)
    .filter(/** @returns {entry is CommitEntry} */ (entry) => Boolean(entry));

  if (commits.length === 0) {
    return "No notable changes.";
  }

  /** @type {CommitEntry["section"][]} */
  const sections = ["Added", "Improved", "Fixed", "Changed", "Docs"];
  /** @type {Map<CommitEntry["section"], string[]>} */
  const grouped = new Map(sections.map((section) => [section, []]));

  for (const commit of commits) {
    const entries = grouped.get(commit.section);
    if (entries && !entries.includes(commit.text)) entries.push(commit.text);
  }

  const lines = [];
  for (const section of sections) {
    const entries = grouped.get(section);
    if (!entries || entries.length === 0) continue;
    lines.push(`## ${section}`);
    lines.push(...entries.map((entry) => `- ${entry}`));
    lines.push("");
  }

  if (repo && from) {
    const fromTag = from.replace(/^refs\/tags\//, "");
    const toRef = to.replace(/^refs\/heads\//, "");
    lines.push(
      `Full Changelog: https://github.com/${repo}/compare/${fromTag}...${toRef}`,
    );
  }

  return lines.join("\n").trim();
}

const from = values.from ?? getDefaultFromTag();
const repo = values.repo ?? getPreferredRepo();
const to = values.to ?? getDefaultToRef(repo);
const notes = buildNotes({ from, to, repo });

process.stdout.write(`${notes}\n`);

if (values.draft) {
  const tag = values.draft;
  const releaseTitle = tag.startsWith("v") ? tag : `v${tag}`;
  const tmpFile = path.join(
    os.tmpdir(),
    `quick-eagle-release-notes-${Date.now()}.md`,
  );
  writeFileSync(tmpFile, notes);

  const args = [
    "release",
    "create",
    releaseTitle,
    "--draft",
    "--title",
    releaseTitle,
    "--notes-file",
    tmpFile,
  ];
  if (repo) args.push("--repo", repo);

  gh(args);
  process.stderr.write(
    `Draft release created: ${releaseTitle}${repo ? ` (${repo})` : ""}\n`,
  );
}
