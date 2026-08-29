import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const TARGET_FILES = ["Dockerfile", "slim.Dockerfile", "next_tag.txt", "next_tag_slim.txt"];

export function detectCurrentVersion(repoRoot) {
  const dockerfile = readFileSync(path.join(repoRoot, "Dockerfile"), "utf8");
  const match = dockerfile.match(/FROM louislam\/uptime-kuma:(\S+)/);
  if (!match) {
    throw new Error("monitor-sync: could not auto-detect current version from Dockerfile's FROM line");
  }
  return match[1];
}

export function bumpVersion(repoRoot, fromVersion, toVersion) {
  const changed = [];
  for (const relPath of TARGET_FILES) {
    const filePath = path.join(repoRoot, relPath);
    const content = readFileSync(filePath, "utf8");
    if (!content.includes(fromVersion)) {
      console.warn(`[bump] ${relPath}: "${fromVersion}" not found, skipping`);
      continue;
    }
    writeFileSync(filePath, content.split(fromVersion).join(toVersion));
    changed.push(relPath);
  }
  return changed;
}
