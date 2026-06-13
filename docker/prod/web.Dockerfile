FROM node:24-bookworm AS build

WORKDIR /workspace

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN npm ci

COPY apps/web apps/web

ARG VITE_API_URL=/api
ARG VITE_WEB_PORT=3443
ARG VITE_ONLYOFFICE_PORT=8443
ARG VITE_ONLYOFFICE_PROXY_TARGET=http://onlyoffice

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WEB_PORT=$VITE_WEB_PORT
ENV VITE_ONLYOFFICE_PORT=$VITE_ONLYOFFICE_PORT
ENV VITE_ONLYOFFICE_PROXY_TARGET=$VITE_ONLYOFFICE_PROXY_TARGET

RUN npm run build -w @ride/web

FROM nginx:1.27-alpine

COPY docker/prod/web.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/web/build /usr/share/nginx/html

EXPOSE 5173
