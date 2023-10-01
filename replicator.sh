#!/usr/bin/dumb-init /bin/bash

BACKUP_FILE_NAME=backup.sql
node server/server.js &
PID=$!

# declare -a tables=("monitor" "monitor_tag" "tag" "monitor_notification" "notification" "monitor_group" "group" "status_page" "monitor_maintenance" "maintenance" "maintenance_status_page" "incident")
declare -a tables=("monitor" "monitor_tag" "tag" "monitor_group" "group" "status_page" "monitor_maintenance" "maintenance" "maintenance_status_page" "incident")

function dump_tables {
    echo 'dump_tables'
    # remove previoud backup (if any) and append all tables dumps to one file
    rm -f /backup/$BACKUP_FILE_NAME
    for table in "${tables[@]}"
    do
        sqlite3 /app/data/kuma.db '.dump "'"$table"'"' >> /backup/$BACKUP_FILE_NAME
    done

}

function restic_restore {
    # check MD5s to see if backup is new, restic creates snapshots in cases of no change too
    # see: https://github.com/restic/restic/issues/662
    restic restore latest --target /backup/restored
    if test -f "/backup/restored/backup/$BACKUP_FILE_NAME"; then
        SNAPSHOT_MD5SUM=$(md5sum /backup/restored/backup/$BACKUP_FILE_NAME | awk '{ print $1 }' )
        LOCAL_MD5SUM=$(md5sum /backup/$BACKUP_FILE_NAME | awk '{ print $1 }' )
        if [ $LOCAL_MD5SUM != $SNAPSHOT_MD5SUM ]
        then
            echo 'restoring remote backup'
            git diff /backup/$BACKUP_FILE_NAME /backup/restored/backup/$BACKUP_FILE_NAME > /app/data/git-diff.sql
            diff /backup/$BACKUP_FILE_NAME /backup/restored/backup/$BACKUP_FILE_NAME > /app/data/diff.sql
            echo "local length" > /app/data/len.txt
            cat /backup/$BACKUP_FILE_NAME | wc -l >> /app/data/len.txt
            echo "remote length" >> /app/data/len.txt
            cat /backup/restored/backup/$BACKUP_FILE_NAME | wc -l >> /app/data/len.txt
            kill $PID
            sleep 30 # wait 30 secs for uptime-kuma to gracefully exit
            for table in "${tables[@]}"
            do
                sqlite3 /app/data/kuma.db 'DROP TABLE '"$table"';'
            done
            cat /backup/restored/backup/$BACKUP_FILE_NAME | sqlite3 /app/data/kuma.db
            node server/server.js &
            PID=$!
        else
            echo 'remote and local are in sync'
        fi
        rm -rf /backup/restored
    else
        echo 'backups are not available or cannot be restored'
    fi
}

function restic_backup {
    # check MD5s to see if backup is new, restic creates snapshots in cases of no change too
    # see: https://github.com/restic/restic/issues/662
    restic restore latest --target /backup/restored
    if test -f "/backup/restored/backup/$BACKUP_FILE_NAME"; then
        SNAPSHOT_MD5SUM=$(md5sum /backup/restored/backup/$BACKUP_FILE_NAME | awk '{ print $1 }' )
        LOCAL_MD5SUM=$(md5sum /backup/$BACKUP_FILE_NAME | awk '{ print $1 }' )
        if [ $LOCAL_MD5SUM != $SNAPSHOT_MD5SUM ]
        then
            echo 'running restic backup'
            restic backup /backup/$BACKUP_FILE_NAME
        else
            echo 'file is the same - skipping backup'
        fi
    else
        echo 'backups are not available or cannot be restored - trying to initiate seed backup anyway'
        restic backup /backup/$BACKUP_FILE_NAME
    fi
    rm -rf /backup/restored
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
