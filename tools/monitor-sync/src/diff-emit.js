import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export function computePatch(originalText, patchedText) {
  const dir = mkdtempSync(path.join(tmpdir(), "monitor-sync-"));
  const originalPath = path.join(dir, "monitor.js.bak");
  const patchedPath = path.join(dir, "monitor.js");
  writeFileSync(originalPath, originalText);
  writeFileSync(patchedPath, patchedText);

  let diffOutput;
  try {
    diffOutput = execFileSync("diff", [originalPath, patchedPath], { encoding: "utf8" });
  } catch (err) {
    if (err.status === 1) {
      diffOutput = err.stdout;
    } else {
      throw err;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  return diffOutput;
}

export function emitPatch(originalText, patchedText, outputPatchPath) {
  const diffOutput = computePatch(originalText, patchedText);
  writeFileSync(outputPatchPath, diffOutput);
  return diffOutput;
}
