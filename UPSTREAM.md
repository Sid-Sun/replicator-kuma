### How to update replicator-kuma to follow updates from upstream

Replicator Kuma is designed to need minimal changes while syncing from upstream.

Currently, the only real change needed is to update the monitor.js patch so it can be applied to the target version from upstream.

This used to be done by hand-editing a freshly downloaded `monitor.js` and regenerating the diff. It is now automated by `tools/monitor-sync`, an AST-based (tree-sitter) semantic patcher that locates each edit by code shape rather than line number, so it survives upstream line/context drift automatically. It downloads the target `monitor.js`, applies the 3 known edits, and emits `monitor.js.patch` in the exact same format the Dockerfiles already consume via `patch < monitor.js.patch` — nothing about how the patch is applied at build time changes.

One-time setup:

```bash
cd tools/monitor-sync
npm install
```

To sync to a new upstream version (bumps `Dockerfile`, `slim.Dockerfile`, `next_tag.txt`, `next_tag_slim.txt` AND regenerates `monitor.js.patch`):

```bash
node bin/sync.js --to 2.5.0
```

The two steps can also be run independently:

```bash
node bin/sync.js bump  --to 2.5.0   # bump the 4 version files (equivalent to the old sed step)
node bin/sync.js patch --to 2.5.0   # download monitor.js, apply the 3 semantic edits, regenerate monitor.js.patch
```

Review the printed `[patch] applied: ...` / `[patch] skipped: ...` summary, then `git diff` the changed files (`Dockerfile`, `slim.Dockerfile`, `next_tag.txt`, `next_tag_slim.txt`, `monitor.js.patch`) before committing.

If upstream has changed the shape of the code around any of the 3 edits, the tool fails loudly (nonzero exit, `could not locate anchor for rule ...`) rather than emit an incomplete patch — inspect `tools/monitor-sync/src/edit-rules.js` and update the relevant anchor query in `tools/monitor-sync/src/anchors/`.

To check that the tool still reproduces the currently committed patch byte-for-byte against the live upstream tag (regression check, requires network access):

```bash
cd tools/monitor-sync && npm run verify
```
