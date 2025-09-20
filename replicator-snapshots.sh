#!/usr/bin/dumb-init /bin/bash

source ./replicator-functions.sh

start_kuma
wait_init

if [ $REPLICATOR_MODE = 'BACKUP' ]
then
  while true; do backupcon; sleep 300; done
fi

# Restore immediately then every 6 mins
while true; do restorecon; sleep 360; done
