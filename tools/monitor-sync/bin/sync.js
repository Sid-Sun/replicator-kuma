#!/usr/bin/env node
import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bumpVersion, detectCurrentVersion } from "../src/version-bump.js";
import { downloadMonitorJs } from "../src/download.js";
import { transformMonitorJs } from "../src/transform.js";
import { emitPatch, computePatch } from "../src/diff-emit.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(__dirname, "../../..");

function usage() {
  console.error(
    "Usage: sync.js [bump|patch|all] --to <version> [--from <version>] [--repo-root <path>] [--force] [--dry-run]"
  );
}

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    to: { type: "string" },
    from: { type: "string" },
    "repo-root": { type: "string" },
    force: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
  },
});

const command = positionals[0] ?? "all";
if (!["bump", "patch", "all"].includes(command) || !values.to) {
  usage();
  process.exit(1);
}

const repoRoot = path.resolve(values["repo-root"] ?? DEFAULT_REPO_ROOT);
const toVersion = values.to;
const fromVersion = values.from ?? detectCurrentVersion(repoRoot);

function runBump() {
  if (values["dry-run"]) {
    console.log(
      `[bump] would replace "${fromVersion}" -> "${toVersion}" in Dockerfile, slim.Dockerfile, next_tag.txt, next_tag_slim.txt`
    );
    return;
  }
  const changed = bumpVersion(repoRoot, fromVersion, toVersion);
  console.log(`[bump] ${fromVersion} -> ${toVersion}: ${changed.join(", ") || "(nothing changed)"}`);
}

async function runPatch() {
  const originalText = await downloadMonitorJs(toVersion);
  const { patchedText, applied, skipped } = transformMonitorJs(originalText, { force: values.force });
  console.log(`[patch] applied: ${applied.join(", ") || "(none)"}`);
  console.log(`[patch] skipped (already present): ${skipped.join(", ") || "(none)"}`);

  const outputPath = path.join(repoRoot, "monitor.js.patch");
  if (values["dry-run"]) {
    const diffText = computePatch(originalText, patchedText);
    const existing = readFileSync(outputPath, "utf8");
    if (diffText === existing) {
      console.log(`[patch] dry-run: generated patch is byte-identical to ${outputPath}`);
    } else {
      console.log(`[patch] dry-run: generated patch DIFFERS from ${outputPath}`);
      console.log(diffText);
      process.exitCode = 1;
    }
    return;
  }

  emitPatch(originalText, patchedText, outputPath);
  console.log(`[patch] wrote ${outputPath}`);
}

if (command === "bump" || command === "all") {
  runBump();
}
if (command === "patch" || command === "all") {
  await runPatch();
}
