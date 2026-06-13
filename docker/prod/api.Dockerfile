FROM node:24-bookworm

WORKDIR /workspace

RUN apt-get update \
  && apt-get install -y --no-install-recommends poppler-utils \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN npm ci

COPY apps/api apps/api

RUN npm run build -w @ride/api

ENV NODE_ENV=production

WORKDIR /workspace/apps/api

EXPOSE 3333

CMD ["node", "dist/main.js"]
