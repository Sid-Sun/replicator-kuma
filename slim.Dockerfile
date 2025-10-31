FROM louislam/uptime-kuma:2.0.2-slim
USER root

RUN apt update && \
    apt --yes --no-install-recommends install procps jq git restic netcat-openbsd && \
    rm -rf /var/lib/apt/lists/* && \
    apt --yes autoremove

RUN restic self-update

# Copy Custom Monitor.js to prepend hostname to notifications
COPY server/model/monitor.js /app/server/model/monitor.js

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