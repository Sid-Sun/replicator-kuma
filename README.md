# Replicator Kuma V2 🏳️‍🌈

Replicator Kuma extends the [uptime-kuma](https://github.com/louislam/uptime-kuma) project by adding support for replicating monitors, status pages, incidents and other entities between uptime-kuma instances.

Replicator Kuma replicates data by exporting the database data into CSV files, converting them to SQL and then using [Restic](https://github.com/restic/restic) to push these files to a storage backend like S3, and then cloning them to replica instances.

Replicator Kuma only creates restic snapshots of files (data) when they change change (the data for heartbeats, TLS, settings, etc. i.e. monitoring and instance specific data is not replicated).

What makes it v2?

Uptime Kuma has gone to v2 (kinda, it is still in beta), it adds support for using MariaDB as the DB while maintaining SQLite support.

## Getting started & what you need to know

Look at the `docker-compose.leader.yaml` and `docker-compose.replica.yaml` files, modify the parameters to suit your restic replication parameters and hostname and start the containers.

Running the replica and leader in completely seperate environments* and adding them to monitor one another is recommended.

Do this by pointing the leader to monitor itself and all other replicas and wait until monitors are relayed across to replicas.

You may add multiple replicas but not multiple leaders. Any** changes made on the replicas will be overwritten when:
1. The replica restarts
2. The leader publishes a new snapshot (a change is made on the leader)

###### *seperate environments: Ideally, seperate geographies and cloud providers (hybrid, off-cloud works too) to provide maximum insulation from an outage taking out your kumas at once.

###### **Replicator Kuma v2 adds support for Local Entities, changes made to these are preserved if replica is running in a certain mode.

### Choosing the DB
Unlike Uptime Kuma v2, using different DBs is supported with Replicator Kuma, the replication puts no constraints on choosing the DB for each instance. 

You may even use this to upgrade your SQLite instance to MySQL, simply stand up a new instance which is connected to MySQL and connect it to the current SQLite leader, wait for it to replicate and then switch the MySQL instance to be the leader.

Replicator Kuma does not need to be configured with which DB is used, it will auto detect the backend and the DB credentials. Simply follow the onboarding steps after starting replicator-kuma,

Note: this will erase your monitoring history.

### Upgrading from v1

Follow the Uptime Kuma upgrade guide, start by upgrading the leader.

The replication on running followers will break once the leader publishes a new snapshot, it should fix itself once the followers are upgraded. You can configure the leader to use a new v2 restic repository to avoid breaking the followers until you upgrade them.

## How it works

Replicator Kuma adds a script to the original uptime-kuma images to provide replication support.

The new images are published to docker hub under `realsidsun/replicator-kuma`.

Alongside the uptime-kuma service, the replicator kuma container periodically runs a few functions to either:
1.  **Backup:** Take a live dump of supported tables from the database into CSV files, extract SQL statements from them, compare the current dump's SHA to the last backup from restic, and if it is different, do a restic backup of the new dump.
2.  **Restore:** Restore the latest backup/snapshot from restic, check if it is different from the last restored snapshot, and if it is, stop uptime-kuma, restore the dump from the new restore, and start it again.

One Replicator Kuma instance only does one of these duties at a time, when the instance is doing backups, it is said to be the primary instance and all the instances following it / restoring its dumps are secondary instances.

There should only be one Primary instance at a time, there is no leader election. The role is assigned by the user when starting the instance through the `REPLICATOR_MODE` environment variable. 

If you need to change the leader:
1. Take the current leader down
2. Make sure the new leader instance is not presently running a restore
3. Take the new leader down, change its repication mode and start it up again.

### Local Entity Replication

Some entities in uptime kuma create centralisation (ex: all monitors using a proxy will fail if that proxy goes down), this is an anti-pattern for replicator kuma (each instance monitoring the target in an independent manner).

Replicator Kuma v2 supports "Local Entity Replication" to handle these cases. When this is enabled, the leader's Local Entity is replicated to the followers but any changes made to them are preserved (ex: you can change a proxy's URL and it won't be updated). 

Each instance's proxy or remote browser can be individually managed, the replication for all other entities remain unchanged.

The following are treated as local entities:
- `proxy`
- `remote_browser`

Note the following caveats (this takes proxy as an example but the same applies to remote browser):
1. If a leader adds or deletes a proxy, this will be replicated to the proxy.

    A. This also means that one monitor cannot have proxy configured on the leader and not the follower (or vice versa)
2. If the leader updates a proxy while its value was never updated on the follower, the follower will continue to have the old value.

    A. If you want to update the value across all followers, deleting the proxy, create a new proxy and configure the monitor to use the new proxy will update it for all followers.
3. Local Entity replication is enabled for both entities, you can't choose to use it for proxy and not remote browser. 

The default behaviour is to treat Local Entities as a regular entity and replace the values on the follower, it must be enabled per follower. 

To enable local entity replication, set the `REPLICATOR_MODE` variable on the follower to `RESTORE_LOCAL_ENTITY_REPLICATION`.


## Configuration

Replicator Kuma is configured using environment variables.

| Variable | Description | Default |
| --- | --- | --- |
| `REPLICATOR_MODE` | Set the mode of the replicator. Can be `BACKUP`, `RESTORE`, or `RESTORE_LOCAL_ENTITY_REPLICATION`. | `RESTORE` |
| `RESTIC_REPOSITORY` | The restic repository URL. | |
| `RESTIC_PASSWORD` | The restic repository password. | |
| `NTFY_URL` | The URL for ntfy.sh notifications. | |
| `AWS_DEFAULT_REGION` | The AWS region for S3. | optional |
| `AWS_ACCESS_KEY_ID` | The AWS access key ID for S3. | optional |
| `AWS_SECRET_ACCESS_KEY` | The AWS secret access key for S3. | optional |

Note: The AWS keys are specified here as I use S3 as the restic storage backend in my setup, you can use any backend restic supports, simply specify the environment variables appropriately. 

### What is replicated?
These are the specific tables replicated:
```
group
user
tag
notification
status_page
proxy
remote_browser
incident
api_key
maintenance
monitor
monitor_notification
monitor_group
monitor_tag
monitor_maintenance
maintenance_status_page
```

## Is Replicator Kuma v2 Production Ready?

Production is a state of mind. With that said, I have not run into any problems.

P.S. You need to run `restic init` to initialize backup repo - Replicator Kuma won't do this for you.

If you run replicator-kuma with AWS S3, you will likely stack up charges due to very regular lookups. Cloudflare R2 has higher limits but also does have charges if you exceed limits.
Using a provider like Backblaze or idrive E2 which do not charge basis of operations but only of storage is a better idea. FWIW, I'm using iDrive E2 as repo for restic.

You can skip S3 altogether and use another protocol for repos as well, restic supports basically everything.

## Update Notes
1.  **New Replication Engine (v2):** The replication engine has been completely rewritten to be more robust and flexible. It now uses a CSV-based approach and supports different database backends (SQLite, MariaDB, and embedded MariaDB).
2.  **Local Entity Replication:** Support for "Local Entity Replication" has been added to handle entities that should be local to each instance.

## Contributions
If you find any quirks of Replicator Kuma or want to enhance it, feel free to raise an issue, PR and whatever else is your favourite Github feature of the week

# ❤️ 🏳️‍🌈