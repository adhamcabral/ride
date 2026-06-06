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
VENDOR_DIR="$(dirname "$VENDOR_TAR")"

mkdir -p "$VENDOR_DIR"

echo "Pulling upstream ONLYOFFICE base image: $UPSTREAM_IMAGE"
docker pull "$UPSTREAM_IMAGE"

echo "Tagging local immutable base: $BASE_IMAGE"
docker tag "$UPSTREAM_IMAGE" "$BASE_IMAGE"

echo "Saving vendored base image to: $VENDOR_TAR"
docker save "$BASE_IMAGE" -o "$VENDOR_TAR"

if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$VENDOR_TAR" > "$VENDOR_TAR.sha256"
  echo "Wrote checksum: $VENDOR_TAR.sha256"
fi

echo "Vendored ONLYOFFICE base image is ready."
