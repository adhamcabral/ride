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
LOCAL_CACHE_TAR="${ONLYOFFICE_LOCAL_CACHE_TAR:-${HOME:-}/.cache/ride/onlyoffice/documentserver.tar}"

load_base_archive() {
  archive_path="$1"
  archive_label="$2"

  echo "Loading $archive_label ONLYOFFICE base image from $archive_path"
  if ! docker load -i "$archive_path"; then
    echo "Could not load $archive_label archive: $archive_path" >&2
    return 1
  fi

  if docker image inspect "$BASE_IMAGE" >/dev/null 2>&1; then
    return 0
  fi

  if docker image inspect "$UPSTREAM_IMAGE" >/dev/null 2>&1; then
    docker tag "$UPSTREAM_IMAGE" "$BASE_IMAGE"
    return 0
  fi

  echo "The $archive_label archive loaded, but it did not provide $BASE_IMAGE." >&2
  return 1
}

save_local_cache() {
  if [ -z "$LOCAL_CACHE_TAR" ]; then
    return 0
  fi

  local_cache_dir="$(dirname "$LOCAL_CACHE_TAR")"
  mkdir -p "$local_cache_dir"
  echo "Saving reusable ONLYOFFICE base archive to $LOCAL_CACHE_TAR"
  docker save "$BASE_IMAGE" -o "$LOCAL_CACHE_TAR"

  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$LOCAL_CACHE_TAR" > "$LOCAL_CACHE_TAR.sha256"
  fi
}

pull_base_image() {
  echo "Pulling upstream ONLYOFFICE base image: $UPSTREAM_IMAGE"
  docker pull "$UPSTREAM_IMAGE"

  echo "Tagging local immutable base: $BASE_IMAGE"
  docker tag "$UPSTREAM_IMAGE" "$BASE_IMAGE"
  save_local_cache
}

if docker image inspect "$BASE_IMAGE" >/dev/null 2>&1; then
  echo "ONLYOFFICE base image already available: $BASE_IMAGE"
  exit 0
fi

if [ -f "$VENDOR_TAR" ]; then
  if load_base_archive "$VENDOR_TAR" "vendored"; then
    exit 0
  fi
fi

if [ -n "$LOCAL_CACHE_TAR" ] && [ -f "$LOCAL_CACHE_TAR" ]; then
  if load_base_archive "$LOCAL_CACHE_TAR" "local cached"; then
    exit 0
  fi
fi

if docker image inspect "$BASE_IMAGE" >/dev/null 2>&1; then
  echo "ONLYOFFICE base image already available: $BASE_IMAGE"
  exit 0
fi

pull_base_image
