ARG ONLYOFFICE_BASE_IMAGE=ride/onlyoffice-documentserver-base:local
FROM ${ONLYOFFICE_BASE_IMAGE}

LABEL org.opencontainers.image.title="Ride ONLYOFFICE Document Server"
LABEL org.opencontainers.image.description="ONLYOFFICE Document Server with Ride local host and UI patches baked in."

USER root

RUN mkdir -p \
  /var/www/onlyoffice/documentserver/sdkjs-plugins \
  /var/www/onlyoffice/documentserver/web-apps/apps/documenteditor/main \
  /var/www/onlyoffice/documentserver/web-apps/apps/spreadsheeteditor/main \
  /var/www/onlyoffice/documentserver/web-apps/apps/presentationeditor/main

COPY ride-office-host.html /var/www/onlyoffice/documentserver/sdkjs-plugins/ride-office-host-v2.html
COPY patches/documenteditor/main/index.html /var/www/onlyoffice/documentserver/web-apps/apps/documenteditor/main/index.html
COPY patches/spreadsheeteditor/main/index.html /var/www/onlyoffice/documentserver/web-apps/apps/spreadsheeteditor/main/index.html
COPY patches/presentationeditor/main/index.html /var/www/onlyoffice/documentserver/web-apps/apps/presentationeditor/main/index.html

RUN chmod 0644 \
  /var/www/onlyoffice/documentserver/sdkjs-plugins/ride-office-host-v2.html \
  /var/www/onlyoffice/documentserver/web-apps/apps/documenteditor/main/index.html \
  /var/www/onlyoffice/documentserver/web-apps/apps/spreadsheeteditor/main/index.html \
  /var/www/onlyoffice/documentserver/web-apps/apps/presentationeditor/main/index.html
