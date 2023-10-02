# FROM louislam/uptime-kuma:1 as base
FROM louislam/uptime-kuma:1 as base
USER root

RUN apt update && \
    apt --yes --no-install-recommends install procps git restic && \
    rm -rf /var/lib/apt/lists/* && \
    apt --yes autoremove

COPY replicator.sh replicator.sh
RUN chown node:node /app/replicator.sh
RUN chmod +x /app/replicator.sh
RUN mkdir /backup
RUN chown node:node /backup

USER node

ENTRYPOINT []
CMD ["/app/replicator.sh"]

# export this with name replicator-kuma for docker compose file
