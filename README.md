# Replicator Kuma 🏳️‍🌈

Replicator Kuma extends the [uptime-kuma](https://github.com/louislam/uptime-kuma) project by adding support for replicating monitors, status pages, incidents and other entities between uptime-kuma instances.

Replicator Kuma replicates data by dumping the SQLite database, using [Restic](https://github.com/restic/restic) to push this dump to a storage backend like S3, and then cloning it to replica instances.

Replicator Kuma only creates restic snapshots of files (data) when they change change (the data for heartbeats, TLS, settings, etc. i.e. monitoring and instance specific data is not replicated).

## Getting started & what you need to know

Look at the docker-compose files, modify the parameters to suit your restic replication parameters and hostname and start the containers.

Running the replica and leader in completely seperate environments** and adding them to monitor one another is recommended. 

Do this by pointing the leader to monitor itself and all other replicas and wait until monitors are relayed across to replicas.

You may add multiple replicas but not multiple leaders. Any changes made on the replicas will be overwritten when:
1. The replica restarts
2. The leader publishes a new snapshot (a change is made on the leader)

###### **seperate environments: Ideally, seperate geographies and cloud providers (hybrid, off-cloud works too) to provide maximum insulation from an outage taking out your kumas at once.

## How it works

Replicator Kuma adds a script to the original uptime-kuma images to provide replication support.

Starting 1.23.16-1, It also modifies monitor.js to prepend the container hostname to notificaion messages making it easier to discern which replica the notification is firing from to assist in diagnosing partial failures.

The new images are published to docker hub under realsidsun/replicator-kuma and follows the same semver number as uptime-kuma (starting from 1.23.13). 

Alongside the uptime-kuma service, the replicator kuma container periodically runs a few functions to either:
1. Take a live dump of some tables (ex: monitor table) from the SQLite DB, compare the current dump's SHA to last backup from restic, if it is different, do a restic backup of the new dump
or
2. Restore the latest backup/snapshot from restic, check if it is different from the last restored snapshot, if it is, stop uptime-kuma, restore the dump from the new restore and start it again. 

One Replicator Kuma instance only does one of these duties at a time, when the instance is doing backups, it is said to be the primary instance and all the instances following it / restoring its dumps are secondary instances.

There should only be one Primary instance at a time, there is no leader election. The role is assigned by the user when starting the instance through the `REPLICATOR_MODE` environment variable to either: `BACKUP` or `RESTORE`.

##### (the latter is not actually enforced, any value except a `BACKUP` will result in a restore / secondary instance)

You'll find the docker compose file to be helpful to set it up, it should be pretty straightforward especially if you've used restic before.

#### Things to note:
1. The secondary instance only does restore based on last restored snapshot and current upstream snapshot; it does not check the current live state so you could make changes to the live state of a secondary instance and it won't be overwritten until either: 
    1. the primary instance pushes a new snapshot to the restic repo
    2. the secondary instance container is restarted

#### What is replicated?
These are the specific tables replicated:
```
monitor
monitor_tag
tag
monitor_notification
notification
monitor_group
group
status_page
monitor_maintenance
maintenance
maintenance_status_page
incident
```

## Is Replicator Kuma Production Ready?

Production is a state of mind. With that said, I have been running Replicator Kuma for 8+ months to monitor my services and have not run into a problem.

P.S. You need to run `restic init` to initialize backup repo - Replicator Kuma won't do this for you.

If you run replicator-kuma with AWS S3, you will likely stack up charges due to very regular lookups. Cloudflare R2 has higher limits but also does have charges if you exceed limits.
Using a provider like Backblaze or idrive E2 which do not charge basis of operations but only of storage is a better idea. FWIW, I'm using iDrive E2 as repo for restic.

You can skip S3 altogether and use another protocol for repos as well, restic supports basically everything.

## Update Notes
Since replicator-kuma follows same version as uptime-kuma, changes made mid-cycle get pushed to the same image; there is no plan to change this as I expect these to be few and far between.
However, there have been a few changes which (while won't break your setup) you should note:

1. Backup and Restore time rhythm was changed on 18 August 2024. Backups happen every 5 mins and Restores every 6 mins.
2. If you've used replicator-kuma prior to 22 September 2024, your restic version is very outdated and likely created a v1 format repo; the new image comes with new restic version. v1 repos still work with the new binary but you should migrate to v2 by running `restic migrate upgrade_repo_v2`
3. As of release `1.23.15`, replicator-kuma supports notifying via ntfy.sh when backups are created and restores carried out.
4. As of `1.23.16-1`, we modify monitor.js to prepend the container hostname to notificaions.


## Contributions
If you find any quirks of Replicator Kuma or want to enhance it, feel free to raise an issue, PR and whatever else is your favourite Github feature of the week 

# ❤️ 🏳️‍🌈
