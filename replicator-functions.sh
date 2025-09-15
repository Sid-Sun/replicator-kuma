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
    sleep 1 # wait 1 second before check again
    done
    echo "[replicator kuma] [control module] uptime-kuma is up and running"
}

function notify_backup {
    [ -n "$NTFY_URL" ] && curl -d "[$HOSTNAME] Replicator Kuma Backup Successful. Time: $(date)" $NTFY_URL
}

function notify_restore {
    [ -n "$NTFY_URL" ] && curl -d "[$HOSTNAME] Replicator Kuma Restored Successfully. Time: $(date)" $NTFY_URL
}

function dump_tables {
    echo "[replicator kuma] [control module] dumping tables into CSV"
    # remove previous backup (if any)
    rm -rf /replicator_kuma
    node /app/replicator-kuma/database-exporter.js
    echo "[replicator kuma] [control module] tables dumped into CSV"
}

function csv2sql {
    echo "[replicator kuma] [control module] converting CSV to SQL"
    node /app/replicator-kuma/csv2sql.js
    echo "[replicator kuma] [control module] converted CSVs to SQL"
}

function restic_restore {
    # check SHA256s to see if backup is new, restic creates snapshots in cases of no change too
    # see: https://github.com/restic/restic/issues/662
    restic restore latest --target $RESTORE_PATH
    if test -f "$RESTORE_PATH/$LOCAL_PATH/$BACKUP_FILE_NAME"; then
        restic snapshots --json | jq '.[-1]' > /backup/latest.json
        SNAPSHOT_SHA256SUM=$(sha256sum /backup/latest.json | awk '{ print $1 }' )

        # If file does not exist, create an empty file
        if ! [ -f "/backup/local.json" ]; then
            touch /backup/local.json
        fi
        LOCAL_SHA256SUM=$(sha256sum /backup/local.json | awk '{ print $1 }' )

        if [ $LOCAL_SHA256SUM != $SNAPSHOT_SHA256SUM ]
        then
            echo 'restoring remote backup'
            stop_kuma
            # echo 'Dropping tables'
            for table in "${tables[@]}"
            do
                # echo 'DROP TABLE "'"$table"'";'
                sqlite3 /app/data/kuma.db 'DROP TABLE "'"$table"'";' # && echo 'Table "'"$table"'" dropped'
            done
            # Restore DB Data
            # echo 'Restoring data'
            cat $RESTORE_PATH/$LOCAL_PATH/$BACKUP_FILE_NAME | sqlite3 /app/data/kuma.db # && echo 'tables restored'
            # echo 'Starting services'
            start_kuma
            # clone latest to local
            cp /backup/{latest.json,local.json}
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
    if test -f "$RESTORE_PATH/$LOCAL_PATH/$BACKUP_FILE_NAME"; then
        SNAPSHOT_SHA256SUM=$(sha256sum $RESTORE_PATH/$LOCAL_PATH/$BACKUP_FILE_NAME | awk '{ print $1 }' )
        LOCAL_SHA256SUM=$(sha256sum $LOCAL_PATH/$BACKUP_FILE_NAME | awk '{ print $1 }' )
        if [ $LOCAL_SHA256SUM != $SNAPSHOT_SHA256SUM ]
        then
            echo 'running restic backup'
            restic backup $LOCAL_PATH
            notify_backup
        else
            echo 'file is the same - skipping backup'
        fi
    else
        echo 'backups are not available or cannot be restored - trying to initiate seed backup anyway'
        restic backup $LOCAL_PATH
    fi
    rm -rf $RESTORE_PATH
}

function restorecon {
    restic_restore
}

function backupcon {
    dump_tables
    csv2sql
    # restic_backup
}

function main {
    if [ $REPLICATOR_MODE = 'BACKUP' ]
    then
    backupcon;
    while true; do sleep 300 && backupcon; done # Backup every 5 mins
    fi

    # Restore every 6 mins
    while true; do sleep 360 && restorecon; done
}
