#!/bin/bash

if [ $RESTORE_MERGE_STRATEGY = 'SNAPSHOT' ]
then
    /app/replicator-snapshots.sh
fi

if [ $RESTORE_MERGE_STRATEGY = 'NOTIFICATIONS_INSERT_MERGE' ]
then
    /app/replicator-notifs.sh
fi

if [ $RESTORE_MERGE_STRATEGY = 'DEFAULT' ]
then
    /app/replicator.sh
fi
