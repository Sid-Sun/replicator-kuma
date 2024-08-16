#!/usr/bin/dumb-init /bin/bash

LOCAL_PATH=/backup/current
RESTORE_PATH=/backup/restored
BACKUP_FILE_NAME=backup.sql

node server/server.js &
PID=$!

declare -a tables=("monitor" "monitor_tag" "tag" "monitor_notification" "notification" "monitor_group" "group" "status_page" "monitor_maintenance" "maintenance" "maintenance_status_page" "incident")

function dump_tables {
    echo 'dump_tables'
    # remove previous backup (if any)
    rm -rf $LOCAL_PATH
    mkdir $LOCAL_PATH
    # append table dumps
    for table in "${tables[@]}"
    do
        sqlite3 /app/data/kuma.db '.dump "'"$table"'"' >> $LOCAL_PATH/$BACKUP_FILE_NAME
    done
}

function stop_kuma {
    kill $PID
    # wait for kuma to stop
    while ps -p $PID >/dev/null 2>&1
    do
        sleep 1;
    done
}

function start_kuma {
    node server/server.js &
    PID=$!
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
    restic_backup
}

if [ $REPLICATOR_MODE = 'BACKUP' ]
then
while true; do sleep 60 && backupcon; done # Give uptime-kuma upto 1 minute to start up
fi

# Give uptime-kuma main instance upto 1 minute 30 secs 
# to start up and backup job to backup
while true; do sleep 15 && restorecon; done
