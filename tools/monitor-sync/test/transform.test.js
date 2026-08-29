import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { transformMonitorJs } from "../src/transform.js";
import { computePatch } from "../src/diff-emit.js";

const fixturesDir = fileURLToPath(new URL("./fixtures/", import.meta.url));

test("2.4.0 fixture produces a diff byte-identical to the committed monitor.js.patch", () => {
  const original = readFileSync(fixturesDir + "monitor-2.4.0.original.js", "utf8");
  const expected = readFileSync(fixturesDir + "monitor-2.4.0.expected.patch", "utf8");

  const { patchedText, applied, skipped } = transformMonitorJs(original);

  assert.deepEqual(applied, ["require-os", "notify-msg-else-hostname", "cert-expiry-hostname-prefix"]);
  assert.deepEqual(skipped, []);

  const actualPatch = computePatch(original, patchedText);
  assert.equal(actualPatch, expected);
});
