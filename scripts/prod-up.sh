#!/bin/sh
set -u

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT_DIR"

env_val() {
  key="$1"
  file="$ROOT_DIR/.env"
  if [ ! -f "$file" ]; then
    return 0
  fi
  sed -n "s/^$key=//p" "$file" | tail -n 1
}

env_def() {
  key="$1"
  fallback="$2"
  value=$(env_val "$key")
  if [ -n "$value" ]; then
    printf '%s' "$value"
  else
    printf '%s' "$fallback"
  fi
}

has_cert() {
  cert_dir="${RIDE_CERT_DIR:-$ROOT_DIR/docker/proxy/certs}"
  cert_file="$cert_dir/$(env_def RIDE_TLS_CERT_FILE ride-local.crt)"
  key_file="$cert_dir/$(env_def RIDE_TLS_KEY_FILE ride-local.key)"
  [ -f "$cert_file" ] && [ -f "$key_file" ]
}

echo "Preparing Ride HTTPS certificate if possible..."
if sh "$ROOT_DIR/scripts/ensure-https-certs.sh"; then
  CERT_OK=1
else
  CERT_OK=0
  echo "WARNING: Could not generate or validate the HTTPS certificate. Production will continue without HTTPS proxy." >&2
fi

if ! npm run docker:ensure-office; then
  exit 1
fi

if [ "$CERT_OK" = "1" ] && has_cert; then
  echo "Starting Ride production with HTTPS proxy:"
  echo "  Web/API:    https://127.0.0.1:${RIDE_HTTPS_PORT:-3443}"
  echo "  ONLYOFFICE: https://127.0.0.1:${ONLYOFFICE_HTTPS_PORT:-8443}"
  docker compose -f docker-compose.prod.yml --profile https up -d --build --remove-orphans
  exec docker compose -f docker-compose.prod.yml --profile https restart proxy
fi

echo "Starting Ride production without HTTPS proxy fallback:"
echo "  Web:        http://127.0.0.1:${WEB_HOST_PORT:-5173}"
echo "  API:        http://127.0.0.1:${API_HOST_PORT:-3333}/api"
echo "  ONLYOFFICE: http://127.0.0.1:${ONLYOFFICE_PORT:-8082}"
docker compose -f docker-compose.prod.yml --profile https stop proxy >/dev/null 2>&1 || true

PUBLIC_APP_URL="http://127.0.0.1:${WEB_HOST_PORT:-5173}" \
PUBLIC_API_URL="http://127.0.0.1:${API_HOST_PORT:-3333}/api" \
VITE_API_URL="http://127.0.0.1:${API_HOST_PORT:-3333}/api" \
CORS_ORIGINS="http://127.0.0.1:${WEB_HOST_PORT:-5173},http://localhost:${WEB_HOST_PORT:-5173}" \
ONLYOFFICE_DOCUMENT_SERVER_URL="http://127.0.0.1:${ONLYOFFICE_PORT:-8082}" \
ONLYOFFICE_HTTPS_PORT="${ONLYOFFICE_PORT:-8082}" \
VITE_WEB_PORT="${WEB_HOST_PORT:-5173}" \
VITE_ONLYOFFICE_PORT="${ONLYOFFICE_PORT:-8082}" \
exec docker compose -f docker-compose.prod.yml up -d --build --remove-orphans
