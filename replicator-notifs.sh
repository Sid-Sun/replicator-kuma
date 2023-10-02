#!/usr/bin/dumb-init /bin/bash

LOCAL_PATH=/backup/current
RESTORE_PATH=/backup/restored
BACKUP_FILE_NAME=backup.sql
NOTIF_BACKUP_FILE_NAME=notifs.sql

node server/server.js &
PID=$!

# declare -a tables=("monitor" "monitor_tag" "tag" "monitor_notification" "notification" "monitor_group" "group" "status_page" "monitor_maintenance" "maintenance" "maintenance_status_page" "incident")
declare -a tables=("monitor" "monitor_tag" "tag" "monitor_group" "group" "status_page" "monitor_maintenance" "maintenance" "maintenance_status_page" "incident")
declare -a notification_tables=("monitor_notification" "notification")

function dump_tables {
    echo 'dump_tables'
    # remove previoud backup (if any)
    rm -rf $LOCAL_PATH
    mkdir $LOCAL_PATH
    # append table dumps
    for table in "${tables[@]}"
    do
        sqlite3 /app/data/kuma.db '.dump "'"$table"'"' >> $LOCAL_PATH/$BACKUP_FILE_NAME
    done
    for table in "${notification_tables[@]}"
    do
        sqlite3 /app/data/kuma.db '.dump "'"$table"'"' >> $LOCAL_PATH/$NOTIF_BACKUP_FILE_NAME
    done
}

function debug_output {
    cp $LOCAL_PATH/$NOTIF_BACKUP_FILE_NAME /app/data/local-notifs.sql
    cp $RESTORE_PATH/$LOCAL_PATH/$NOTIF_BACKUP_FILE_NAME /app/data/remote-notifs.sql
    git diff $LOCAL_PATH/$NOTIF_BACKUP_FILE_NAME $RESTORE_PATH/$LOCAL_PATH/$NOTIF_BACKUP_FILE_NAME > /app/data/git-diff.sql
    diff $LOCAL_PATH/$NOTIF_BACKUP_FILE_NAME $RESTORE_PATH/$LOCAL_PATH/$NOTIF_BACKUP_FILE_NAME > /app/data/diff.sql
    echo "local length" > /app/data/len.txt
    cat $LOCAL_PATH/$NOTIF_BACKUP_FILE_NAME | wc -l >> /app/data/len.txt
    echo "remote length" >> /app/data/len.txt
    cat $RESTORE_PATH/$LOCAL_PATH/$NOTIF_BACKUP_FILE_NAME | wc -l >> /app/data/len.txt
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

function drop_restore_all {
    echo 'Dropping tables'
    for table in "${tables[@]}"
    do
        # echo 'DROP TABLE "'"$table"'";'
        sqlite3 /app/data/kuma.db 'DROP TABLE "'"$table"'";' # && echo 'Table "'"$table"'" dropped'
    done
    # Restore DB Data
    # echo 'Restoring data'
    cat $RESTORE_PATH/$LOCAL_PATH/$BACKUP_FILE_NAME | sqlite3 /app/data/kuma.db # && echo 'tables restored'
}

function drop_restore_notifs {
    echo 'Dropping nofification tables'
    for table in "${notification_tables[@]}"
    do
        echo 'DROP TABLE "'"$table"'";'
        sqlite3 /app/data/kuma.db 'DROP TABLE "'"$table"'";' && echo 'Table "'"$table"'" dropped'
    done
    # Restore DB Data
    # echo 'Restoring data'
    cat $RESTORE_PATH/$LOCAL_PATH/$NOTIF_BACKUP_FILE_NAME | sqlite3 /app/data/kuma.db # && echo 'tables restored'
}

function restic_restore {
    # check SHA256s to see if backup is new, restic creates snapshots in cases of no change too
    # see: https://github.com/restic/restic/issues/662
    restic restore latest --target $RESTORE_PATH
    if test -f "$RESTORE_PATH/$LOCAL_PATH/$NOTIF_BACKUP_FILE_NAME"; then
        # All tables
        SNAPSHOT_SHA256SUM=$(sha256sum $RESTORE_PATH/$LOCAL_PATH/$BACKUP_FILE_NAME | awk '{ print $1 }' )
        LOCAL_SHA256SUM=$(sha256sum $LOCAL_PATH/$BACKUP_FILE_NAME | awk '{ print $1 }' )
        # Notification tables use a different way to check if there is a change
        # The Create table commands seem to cause MD5 diffs even when there are none - we filter only INSERTS
        # This MIGHT cause issus when migrating
        SNAPSHOT_NOTIF_SHA256SUM=$(cat $RESTORE_PATH/$LOCAL_PATH/$NOTIF_BACKUP_FILE_NAME | grep 'INSERT INTO' | sha256sum | awk '{ print $1 }' )
        LOCAL_NOTIF_SHA256SUM=$(cat $LOCAL_PATH/$NOTIF_BACKUP_FILE_NAME | grep 'INSERT INTO' | sha256sum | awk '{ print $1 }' )
        # If either dumps changed from upstream, run a restore
        if [ $LOCAL_SHA256SUM != $SNAPSHOT_SHA256SUM ] || [ $LOCAL_NOTIF_SHA256SUM != $SNAPSHOT_NOTIF_SHA256SUM ]
        then
            echo 'restoring remote backup'
            stop_kuma
            if [ $LOCAL_SHA256SUM != $SNAPSHOT_SHA256SUM ]
            then
                drop_restore_all
            fi
            if [ $LOCAL_NOTIF_SHA256SUM != $SNAPSHOT_NOTIF_SHA256SUM ]
            then
                debug_output
                drop_restore_notifs
            fi
            # echo 'Starting services'
            start_kuma
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
    if test -f "$RESTORE_PATH/$LOCAL_PATH/$NOTIF_BACKUP_FILE_NAME"; then
        # All tables
        SNAPSHOT_SHA256SUM=$(sha256sum $RESTORE_PATH/$LOCAL_PATH/$BACKUP_FILE_NAME | awk '{ print $1 }' )
        LOCAL_SHA256SUM=$(sha256sum $LOCAL_PATH/$BACKUP_FILE_NAME | awk '{ print $1 }' )
        # Notification tables
        SNAPSHOT_NOTIF_SHA256SUM=$(sha256sum $RESTORE_PATH/$LOCAL_PATH/$NOTIF_BACKUP_FILE_NAME | awk '{ print $1 }' )
        LOCAL_NOTIF_SHA256SUM=$(sha256sum $LOCAL_PATH/$NOTIF_BACKUP_FILE_NAME | awk '{ print $1 }' )
        # If either dumps changed from upstream, run a backup
        if [ $LOCAL_SHA256SUM != $SNAPSHOT_SHA256SUM ] || [ $SNAPSHOT_NOTIF_SHA256SUM != $LOCAL_NOTIF_SHA256SUM ]
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
    dump_tables
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
while true; do sleep 90 && restorecon; done
