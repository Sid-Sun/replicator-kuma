## Replicator Kuma

As uptime-kuma currently has no native or blessed way to replicate monitors and other data between instances, Replicator Kuma is an attempt to do this.

This is an extension of the uptime-kuma service which replicates some tables of the SQLite database of uptime-kuma between instances by leveraging DB dumps, restores and restic to push the dump to S3 (or other supported backends).

Replicator Kuma only creates restic snapshots of files (data) when they change change (the data for heartbeats, TLS, settings, etc. i.e. monitoring and instance specific data is not replicated) this selective backup happens by leveraging SHA256 sums - we dump the data and compare latest snapshot data with the new dump.

### Merge Stratrgy Comparision Table

You can switch between meodes by setting the `RESTORE_MERGE_STRATEGY` env variable to one of:

- `SNAPSHOT` (_recommended_)
- `NOTIFICATIONS_INSERT_MERGE`
- `DEFAULT`

| **script**                  | **differentiation**                                                                                                                                            | **what happens on replica**                                                           | **quirks**                                                                                                   |
|-----------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------|
| **replicator.sh**           | does not replicate notification tables                                                                                                                         | restore if SHA of main and replica dump changes                                       | notifications are not replicated                                                                             |
| **replicator-notifs.sh**    | replicates notifs tables but does change detection through a grep + SHA                                                                                        | above + SHA on grep for notification tables to check their equality                   | some columns are floats, ARM and x86 handle these differently so in a mixed fleet, every check is a restore  |
| **replicator-snapshots.sh** | rely on main instance to do SHA check on dump, if it changes backup to restic and ALWAYS restore on replica if there is a new snapshot and when initial bootup | always restore on bootstrap + if a new snapshot is available, restore unconditionally | changes made on replica are not overwritten until restart or new main snapshot                               |

### NOT PRODUCTION READY**

#### ** Since writing this, I have made the startling discovery that production is, in fact, a state of mind. 
#### I have been running Replicator Kuma for a few months with snapshot merge strategy and have not run into an issue; I haven't, however, upgraded yet.

There are a few cons to keep in mind which are not solved:
1. DB Migrations - pin your kuma versions and when updating ensure:
    1. You don't update main and restore data to replicas as they might cause conflicts
    2. You don't update replicas then restore old data to them as this would override migration and probably break the code 
    3. How you prolly want to do this is:
        1. Pin replicas and main to same updated version of `uptime-kuma` WITHOUT Replicator (i.e. use the original image or add something to prevent replicator from running - this is not added right now)
        2. Once all replicas and main are on the same version, start Replicator Kuma on main, let it do initial backup.
        3. Start replicated instances.
        4. ^^ this is just off the top of my head but it should work - no pinky promises
2. Keep ONLY 1 main instance 
    1. while this won't immeditately break anything it may cause inconsistencies in your fleet and upgrades would be prone to break even more
    2. also, note that when container spins up there is a delay before Replica Kuma spins up, this is: 
        - main instance: 60 secs
        - replias: 90 secs
        - this is to allow uptime-kuma to spin up and carry out any initialization and / or migrations it may need to before backups are triggered
3. ONLY add new monitors and make changes from main instance
    - unless you want it to be overwritten by Replicator Kuma every time it runs
    - also, add `cross-monitoring` for all uptime kuma instances (even monitor the main instance itself) - this will cause all instances to monitor themselves but since only main instance is source of truth, it is unavoidable
    - notification channels and notifications for monitors are not replicated by default, you must configure this across the fleet manually (or via the API - but then why why Replicator Kuma at all?)
4. When Replicator Kuma decides to restore, it will:
    1. stop the running instance of uptime-kuma within the container (gracefully) - monitoring it until it quits
    2. drop the DB tables 
    3. restore the data from dump from restic backup (this takes a lil bit)
    4. start the process again
    5. this will cause some downtime (there is a sleep to make sure instance has stopped) plan your notifications accordingly
5. `replicator.sh` defines which tables to replicate
    1. by default it replicates everything it safely can except:
        - notifications
        - monitor_notification
    2. these two define where notifications for downtime go and the channels to send them, these are not replicated in `replicator.sh` because:
        1. these two seem to have some sort of index or something on top of it which triggers hash check every time Replicator Kuma runs 
        2. therefore, restore happens every time Replicator Kuma runs which depends on `replicator.sh` (default is every 1.5 mins)
        3. As mentioned above, every time restore is triggered, service will gracefully stop - this may lead to some cross-monitoring to fail but the downtime is minimal as Replicator Kuma checks to see if the service has stopped before continuing drops and restores
        4. this may not be a problem if you are okay with higher replication lag.
        5. `replicator.sh` writes 3 files to /app/data to try to debug this issue - I haven't made much progress to solve this yet, however I think:
            1. A more non-trivial method to figure out if there are changes might help - but, this is tricky as all other tables are cool with SHA256 sum based diffs and this will almost definitely introduce more quirks
            2. Understand exactly what is up with these 2 tables
            3. To get these files you will need to enable replication for these 2 (or even 1) table(s).
            4. Or, check this photo: https://ibb.co/swT8ZGp
    3. update: there is now `replicator-notifs.sh` which replicates these two tables by using a different mechanism:
        1. The problem in comparing hashes stems from `CREATE TABLE` entries in the dump file, `replicator-notifs.sh` greps for `INSERT` statements between the two dumps and compares the hashes of these - which are indeed identical if the data is identical
        2. This _may_ be problematic when doing DB migrations and remains untested. However,:
            1. presumably if a field is added new dump's INSERT would have the new field and might be okay, same goes for deletes - if a field is renamed and replication happens between different version numbers, this will prolly break your instance. 
                - If this happens, a way to solve it would be to trigger a new insert or remove notification from the main instance so the new table schema is updated along with the data
                - Obviously, this presumes main is updated before replica, so, don't update replica before main :)
            2. notifs tables might be more or less stable on uptime-kuma
        3. `replicator-notifs.sh` uses a separate file for these two tables - all other tables follow the classic mechanism of hashes across entire dump so they remain unaffected and free from any quirks
        4. `replicator-snapshots.sh` - use restic snapshot IDs, storing the last applied snapshot in a file on container (or data, but yah) and applying snapshot change if the ID changes - the main instance is consistent in not creating snapshot without change to data. One quirk of this would be:
            - If the replica notifs are updated but main is the same, the change won't be reconsiled to replica from main unless the container restarts (assuming last applied file is in container) 
6. P.S. You need to run `restic init` to initialize backup repo - Replicator Kuma won't do this for you

### Feel free to work on these and raise a PR! <3 
#### If you find more quirks of Replicator Kuma, raise an issue or PR to update this readme with detailed steps to reproduce it
