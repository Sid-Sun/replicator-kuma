## Replicator Kuma

As uptime-kuma currently has no native or blessed way to replicate monitors and other data between instances, Replicator Kuma is an attempt to do this.

This is an extension of the uptime-kuma project to solve this. Replicator Kuma replicates some tables of the SQLite database between uptime-kuma instances by leveraging DB dumps and restores; restic is used to push the dump to S3 (or other supported backends) from where it is cloned to the replica/secondary instances.

Replicator Kuma only creates restic snapshots of files (data) when they change change (the data for heartbeats, TLS, settings, etc. i.e. monitoring and instance specific data is not replicated) this selective backup happens by leveraging SHA256 sums - we dump the data and compare latest snapshot data with the new dump.

### How it works

Alongside the uptime-kuma service, the replicator kuma container periodically runs a few functions to either:
1. Take a live dump of some tables (ex: monitor table) from the SQLite DB, compare the current dump's SHA to last backup from restic, if it is different, do a restic backup of the new dump
or
2. Restore the latest backup/snapshot from restic, check if it is different from the last restored snapshot, if it is, stop uptime-kuma, restore the dump from the new restore and start it again. 

One Replicator Kuma instance only does one of these duties at a time, when the instance is doing backups, it is said to be the primary instance and all the instances following it / restoring its dumps are secondary instances.

There should only be one Primary instance at a time, there is no leader election. The role is assigned by the user when starting the instance through the `REPLICATOR_MODE` environment variable to either: BACKUP or `RESTORE`.

##### (the latter is not actually enforced, any value except a `BACKUP` will result in a restore / secondary instance)

Things to note:
1. The secondary instance only does restore based on last restored snapshot and current upstream snapshot; it does not check the current live state so you could make changes to the live state of a secondary instance and it won't be overwritten until either: 
    1. the primary instance pushes a new snapshot to the restic repo
    2. the secondary instance container is restarted

### IS THIS PRODUCTION READY?

#### Production is a state of mind. With that said, I have been running Replicator Kuma for 8+ months to monitor my services and have not run into a problem.

P.S. You need to run `restic init` to initialize backup repo - Replicator Kuma won't do this for you. 
FWIW, I'm using Cloudflare R2 as repo for restic

#### If you find any quirks of Replicator Kuma or want to enhance it, feel free to raise an issue, PR and whatever else is your favourite Github feature of the week <3
