# FROM louislam/uptime-kuma:1 as base
FROM louislam/uptime-kuma:1.23.2 as base
USER root

RUN apt update && \
    apt --yes --no-install-recommends install procps jq git restic && \
    rm -rf /var/lib/apt/lists/* && \
    apt --yes autoremove

COPY replicator-snapshots.sh replicator-snapshots.sh
COPY replicator-notifs.sh replicator-notifs.sh
COPY replicator.sh replicator.sh
COPY entry.sh entry.sh
# RUN chown node:node /app/replicator.sh
RUN chmod +x /app/replicator-snapshots.sh
RUN chmod +x /app/replicator-notifs.sh
RUN chmod +x /app/replicator.sh
RUN chmod +x /app/entry.sh
RUN mkdir /backup
# RUN chown node:node /backup

ENTRYPOINT []
CMD ["/app/entry.sh"]

# export this with name replicator-kuma for docker compose file
