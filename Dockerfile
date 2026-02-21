FROM louislam/uptime-kuma:2.1.3
USER root

RUN apt update && \
    apt --yes --no-install-recommends install procps jq git restic netcat-openbsd patch && \
    rm -rf /var/lib/apt/lists/* && \
    apt --yes autoremove

RUN restic self-update

# Copy and apply patch to prepend hostname to notifications
COPY monitor.js.patch /app/monitor.js.patch
RUN patch /app/server/model/monitor.js < /app/monitor.js.patch

# Copy Replicator Kuma Stuff
COPY src /app/replicator-kuma
RUN cd /app/replicator-kuma; npm install
COPY replicator-snapshots.sh replicator-snapshots.sh
COPY replicator-functions.sh replicator-functions.sh
RUN chmod +x /app/replicator-snapshots.sh
RUN mkdir /replicator_kuma

ENTRYPOINT []
CMD ["/app/replicator-snapshots.sh"]

# export this with name replicator-kuma for docker compose file
