#!/usr/bin/env node

// @ts-check

// Print the portless name for this checkout's dev server.
//
// `portless run` infers the name itself, but in a multi-worktree clone it
// prefixes the branch's last path segment to the hostname and never truncates
// it — a Linear branch like `carter/eve-125-keyword-research-city-and-county-`
// `volume-not-just-country` then produces a DNS label longer than 63
// characters and the browser can't resolve the `.localhost` URL at all. This
// prints the same name portless would infer, except the prefix is capped well
// under that limit (55 + `.open-seo` stays under 63).

import { execFileSync } from "node:child_process";

/** @param {string[]} args */
function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

const DEFAULT_BRANCHES = new Set(["main", "master"]);
const MAX_PREFIX_LENGTH = 55;

const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
const lastSegment = branch.split("/").pop() ?? "";
const isWorktree =
  git(["worktree", "list"]).split("\n").filter(Boolean).length > 1;
const isDefaultBranch =
  !branch || branch === "HEAD" || DEFAULT_BRANCHES.has(branch);

// Same rules as portless's sanitizeForHostname, plus the length cap.
const sanitized = lastSegment
  .toLowerCase()
  .replace(/[^a-z0-9-]/g, "-")
  .replace(/-{2,}/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, MAX_PREFIX_LENGTH)
  .replace(/-+$/g, "");

const prefix =
  isWorktree && !isDefaultBranch && sanitized ? `${sanitized}.` : "";
process.stdout.write(`${prefix}open-seo`);
