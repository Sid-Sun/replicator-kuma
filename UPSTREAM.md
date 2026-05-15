### How to update replicator-kuma to follow updates from upstream

Replicator Kuma is designed to need minimal changes while syncing from upstream.

Currently, the only real change needed is to update the monitor.js patch so it can be applied to the target version from upsteam.

This is done by:

1. Update the current version number to target version number:

```bash
sed -i 's/current/target/g' Dockerfile slim.Dockerfile next_tag.txt next_tag_slim.txt
```

2. Clone the target monitor.js

```bash
curl -o monitor.js https://raw.githubusercontent.com/louislam/uptime-kuma/refs/tags/2.3.2/server/model/monitor.js
cp monitor.js monitor.js.bak
```

3. Apply the same changes in monitor.js and create the diff patch:

```bash
diff monitor.js.bak monitor.js > monitor.js.patch
rm -f monitor.js.bak monitor.js
```
