#!/usr/bin/dumb-init /bin/bash


LOCAL_PATH=/replicator_kuma/current
RESTORE_PATH=/replicator_kuma/restored

PID=-1

function stop_kuma {
    echo "[replicator kuma] [control module] stopping uptime-kuma"
    kill $PID
    # wait for kuma to stop
    while ps -p $PID >/dev/null 2>&1
    do
        sleep 1;
    done
}

function start_kuma {
    echo "[replicator kuma] [control module] starting uptime-kuma"
    node server/server.js &
    PID=$!
    while ! nc -z localhost 3001; do
        sleep 1
    done
    echo "[replicator kuma] [control module] uptime-kuma is up and running"
}

function notify_backup {
    echo "[replicator kuma] [control module] backup successful"
    # [ -n "$NTFY_URL" ] && curl -d "[$HOSTNAME] Replicator Kuma Backup Successful. Time: $(date)" $NTFY_URL
}

function notify_restore {
    echo "[replicator kuma] [control module] restore successful"
    # [ -n "$NTFY_URL" ] && curl -d "[$HOSTNAME] Replicator Kuma Restored Successfully. Time: $(date)" $NTFY_URL
}

function restic_restore {
    # check SHA256s to see if backup is new, restic creates snapshots in cases of no change too
    # see: https://github.com/restic/restic/issues/662
    restic restore latest --target $RESTORE_PATH
    if [ "$(ls -A $RESTORE_PATH)" ]; then
        restic snapshots --json | jq '.[-1]' > /replicator_kuma/latest.json
        SNAPSHOT_SHA256SUM=$(sha256sum /replicator_kuma/latest.json | awk '{ print $1 }' )

        # If file does not exist, create an empty file
        if ! [ -f "/replicator_kuma/local.json" ]; then
            touch /replicator_kuma/local.json
        fi
        LOCAL_SHA256SUM=$(sha256sum /replicator_kuma/local.json | awk '{ print $1 }' )
        echo "[restore] Snapshot: $SNAPSHOT_SHA256SUM Local: $LOCAL_SHA256SUM"

        if [ $LOCAL_SHA256SUM != $SNAPSHOT_SHA256SUM ]
        then
            echo 'restoring remote backup'
            stop_kuma
            ln -s $RESTORE_PATH $LOCAL_PATH
            # Restore DB Data
            node /app/replicator-kuma/database-importer.js
            # echo 'Starting services'
            start_kuma
            # clone latest to local
            cp /replicator_kuma/{latest.json,local.json}
            notify_restore
        else
            echo 'remote and local are in sync'
        fi
        rm -rf $RESTORE_PATH
    else
        echo 'backups are not available or cannot be restored'
    fi
}

function restic_backup {
    # check SHA256s to see if backup is new, restic creates snapshots in cases of no change too
    # see: https://github.com/restic/restic/issues/662
    restic restore latest --target $RESTORE_PATH
    if [ "$(ls -A $RESTORE_PATH)" ]; then
        # create a sha sum of every file in restore and local path and sum this checksum output for change detection
        SNAPSHOT_FILES_CHECKSUM=$(find $RESTORE_PATH -type f -exec sha256sum {} + | sort -k 2)
        echo "$SNAPSHOT_FILES_CHECKSUM" > /replicator_kuma/snapshot_files_checksum
        CURRENT_FILES_CHECKSUM=$(find $LOCAL_PATH -type f -exec sha256sum {} + | sort -k 2)
        echo "$SNAPSHOT_FILES_CHECKSUM" > /replicator_kuma/current_files_checksum
        diff /replicator_kuma/snapshot_files_checksum /replicator_kuma/current_files_checksum
        SNAPSHOT_SHA256SUM=$(echo "$SNAPSHOT_FILES_CHECKSUM" | awk '{ print $1 }' | sha256sum | awk '{ print $1 }')
        LOCAL_SHA256SUM=$(echo "$CURRENT_FILES_CHECKSUM" | awk '{ print $1 }' | sha256sum | awk '{ print $1 }')
        echo "[backup] Snapshot: $SNAPSHOT_SHA256SUM Local: $LOCAL_SHA256SUM"
        if [ $LOCAL_SHA256SUM != $SNAPSHOT_SHA256SUM ]
        then
            echo '[replicator kuma] [control module] running restic backup'
            cd $LOCAL_PATH
            restic backup .
            cd /app
            notify_backup
        else
            echo '[replicator kuma] [control module] file is the same - skipping backup'
        fi
    else
        echo '[replicator kuma] [control module] backups are not available or cannot be restored - trying to initiate seed backup anyway'
        restic backup $LOCAL_PATH
    fi
    rm -rf $RESTORE_PATH
}

function wait_init {
    # This prevents replicator kuma from interrupting a new instance creation
    while [ ! -s "/app/data/db-config.json" ]; do
        echo "[replicator kuma] [control module] DB Config file not found or is empty. Waiting for initilisation..."
        sleep 5
    done
        echo "[replicator kuma] [control module] uptime-kuma is initialised, starting replicator kuma..."
    # Finally, wait for 5 more secs to give uptime-kuma time to initialise the DB
    sleep 5
}

function restorecon {
    restic_restore
}

function backupcon {
    # remove previous backup (if any)
    rm -rf /replicator_kuma/current
    node /app/replicator-kuma/database-exporter.js
    node /app/replicator-kuma/csv2sql.js
    restic_backup
}
