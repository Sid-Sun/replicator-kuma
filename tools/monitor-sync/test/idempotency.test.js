import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { transformMonitorJs } from "../src/transform.js";

const fixturesDir = fileURLToPath(new URL("./fixtures/", import.meta.url));

test("re-running against already-patched text applies nothing and skips all 3 rules", () => {
  const original = readFileSync(fixturesDir + "monitor-2.4.0.original.js", "utf8");
  const first = transformMonitorJs(original);
  assert.deepEqual(first.applied, ["require-os", "notify-msg-else-hostname", "cert-expiry-hostname-prefix"]);

  const second = transformMonitorJs(first.patchedText);
  assert.deepEqual(second.applied, []);
  assert.deepEqual(second.skipped, ["require-os", "notify-msg-else-hostname", "cert-expiry-hostname-prefix"]);
  assert.equal(second.patchedText, first.patchedText);
});
