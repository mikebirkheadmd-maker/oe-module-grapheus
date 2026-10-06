# OpenEMR with Grapheus by Exetazo built in.
# Grapheus does nothing until a practice connects a paid Grapheus account.
ARG OPENEMR_VERSION=7.0.3
FROM openemr/openemr:${OPENEMR_VERSION}
LABEL org.opencontainers.image.title="OpenEMR + Grapheus" \
      org.opencontainers.image.description="OpenEMR with the Grapheus AI scribe and Setup Assistant preinstalled (requires a Grapheus subscription)." \
      org.opencontainers.image.vendor="Exetazo Health" \
      org.opencontainers.image.licenses="GPL-3.0-or-later" \
      org.opencontainers.image.source="https://github.com/mikebirkheadmd-maker/oe-module-grapheus"
# Build from the repository root:  docker build -f distribution/Dockerfile .
COPY . /var/www/localhost/htdocs/openemr/interface/modules/custom_modules/oe-module-grapheus
COPY distribution/grapheus-start.sh /var/www/localhost/htdocs/openemr/grapheus-start.sh
RUN rm -rf /var/www/localhost/htdocs/openemr/interface/modules/custom_modules/oe-module-grapheus/distribution /var/www/localhost/htdocs/openemr/interface/modules/custom_modules/oe-module-grapheus/.github \
 && chown -R apache:root /var/www/localhost/htdocs/openemr/interface/modules/custom_modules/oe-module-grapheus \
 && chmod 755 /var/www/localhost/htdocs/openemr/grapheus-start.sh
CMD ["./grapheus-start.sh"]
