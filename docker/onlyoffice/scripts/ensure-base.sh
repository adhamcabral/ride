#!/usr/bin/env sh
set -eu

if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

BASE_IMAGE="${ONLYOFFICE_BASE_IMAGE:-ride/onlyoffice-documentserver-base:local}"
UPSTREAM_IMAGE="${ONLYOFFICE_UPSTREAM_IMAGE:-onlyoffice/documentserver:latest}"
VENDOR_TAR="${ONLYOFFICE_VENDOR_TAR:-docker/onlyoffice/vendor/documentserver.tar}"

if docker image inspect "$BASE_IMAGE" >/dev/null 2>&1; then
  echo "ONLYOFFICE base image already available: $BASE_IMAGE"
  exit 0
fi

if [ -f "$VENDOR_TAR" ]; then
  echo "Loading vendored ONLYOFFICE base image from $VENDOR_TAR"
  docker load -i "$VENDOR_TAR"

  if docker image inspect "$BASE_IMAGE" >/dev/null 2>&1; then
    exit 0
  fi

  if docker image inspect "$UPSTREAM_IMAGE" >/dev/null 2>&1; then
    docker tag "$UPSTREAM_IMAGE" "$BASE_IMAGE"
    exit 0
  fi

  echo "The vendor archive loaded, but it did not provide $BASE_IMAGE." >&2
  echo "Recreate it with: npm run docker:vendor-office" >&2
  exit 1
fi

echo "Missing local ONLYOFFICE base image: $BASE_IMAGE" >&2
echo "Missing vendor archive: $VENDOR_TAR" >&2
echo "Run this once while the upstream image is still available:" >&2
echo "  npm run docker:vendor-office" >&2
echo "Then run:" >&2
echo "  npm run dev" >&2
exit 1
