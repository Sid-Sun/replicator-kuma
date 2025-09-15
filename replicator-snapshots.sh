#!/usr/bin/dumb-init /bin/bash

source ./replicator-functions.sh

start_kuma

function main {
    if [ $REPLICATOR_MODE = 'BACKUP' ]
    then
    backupcon;
    while true; do sleep 300 && backupcon; done 
    fi

    # Restore immediately then every 6 mins
    restorecon;
    while true; do sleep 360 && restorecon; done
}

main
