#!/bin/sh
set -u

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT_DIR"

read_env_value() {
  key="$1"
  file="$ROOT_DIR/.env"
  if [ ! -f "$file" ]; then
    return 0
  fi
  sed -n "s/^$key=//p" "$file" | tail -n 1
}

env_or_default() {
  key="$1"
  fallback="$2"
  value=$(read_env_value "$key")
  if [ -n "$value" ]; then
    printf '%s' "$value"
  else
    printf '%s' "$fallback"
  fi
}

CERT_DIR="${RIDE_CERT_DIR:-$ROOT_DIR/docker/proxy/certs}"
CERT_FILE="$CERT_DIR/$(env_or_default RIDE_TLS_CERT_FILE ride-local.crt)"
KEY_FILE="$CERT_DIR/$(env_or_default RIDE_TLS_KEY_FILE ride-local.key)"

echo "Preparing Ride HTTPS certificate if possible..."
if sh "$ROOT_DIR/scripts/ensure-https-certs.sh"; then
  CERT_ATTEMPT_OK=1
else
  CERT_ATTEMPT_OK=0
  echo "WARNING: Could not generate or validate the HTTPS certificate. Ride will continue without HTTPS proxy." >&2
fi

if ! npm run docker:ensure-office; then
  exit 1
fi

if [ "$CERT_ATTEMPT_OK" = "1" ] && [ -f "$CERT_FILE" ] && [ -f "$KEY_FILE" ]; then
  echo "Starting Ride with HTTPS proxy:"
  echo "  Web/API:    https://127.0.0.1:${RIDE_HTTPS_PORT:-3443}"
  echo "  ONLYOFFICE: https://127.0.0.1:${ONLYOFFICE_HTTPS_PORT:-8443}"
  exec docker compose --profile https up -d --build
fi

echo "Starting Ride without HTTPS proxy fallback:"
echo "  Web:        http://127.0.0.1:${WEB_HOST_PORT:-5173}"
echo "  API:        http://127.0.0.1:${API_HOST_PORT:-3333}/api"
echo "  ONLYOFFICE: http://127.0.0.1:${ONLYOFFICE_PORT:-8082}"
docker compose --profile https stop proxy >/dev/null 2>&1 || true

PUBLIC_APP_URL="http://127.0.0.1:${WEB_HOST_PORT:-5173}" \
PUBLIC_API_URL="http://127.0.0.1:${API_HOST_PORT:-3333}/api" \
VITE_API_URL="http://127.0.0.1:${API_HOST_PORT:-3333}/api" \
CORS_ORIGINS="http://127.0.0.1:${WEB_HOST_PORT:-5173},http://localhost:${WEB_HOST_PORT:-5173}" \
ONLYOFFICE_DOCUMENT_SERVER_URL="http://127.0.0.1:${ONLYOFFICE_PORT:-8082}" \
VITE_WEB_PORT="${WEB_HOST_PORT:-5173}" \
exec docker compose up -d --build
