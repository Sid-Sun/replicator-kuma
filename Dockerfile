FROM louislam/uptime-kuma:1.23.16
USER root

RUN apt update && \
    apt --yes --no-install-recommends install procps jq git restic && \
    rm -rf /var/lib/apt/lists/* && \
    apt --yes autoremove

RUN restic self-update

# Copy Custom Monitor.js to prepend hostname to notifications
COPY server/model/monitor.js /app/server/model/monitor.js

# Copy Replicator Kuma Stuff
COPY replicator-snapshots.sh replicator-snapshots.sh
RUN chmod +x /app/replicator-snapshots.sh
RUN mkdir /backup

ENTRYPOINT []
CMD ["/app/replicator-snapshots.sh"]

# export this with name replicator-kuma for docker compose file
