#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
CERT_DIR="${RIDE_CERT_DIR:-$ROOT_DIR/docker/proxy/certs}"
CERT_NAME="${RIDE_CERT_NAME:-ride-local}"
CERT_FILE="$CERT_DIR/${RIDE_TLS_CERT_FILE:-$CERT_NAME.crt}"
KEY_FILE="$CERT_DIR/${RIDE_TLS_KEY_FILE:-$CERT_NAME.key}"
CA_CERT_FILE="$CERT_DIR/${RIDE_CA_CERT_FILE:-$CERT_NAME-ca.crt}"
CA_KEY_FILE="$CERT_DIR/${RIDE_CA_KEY_FILE:-$CERT_NAME-ca.key}"
CA_SERIAL_FILE="$CERT_DIR/$CERT_NAME-ca.srl"
HOSTS_FILE="$CERT_DIR/$CERT_NAME.hosts"
OPENSSL_CONFIG="$CERT_DIR/$CERT_NAME.openssl.cnf"
CA_CONFIG="$CERT_DIR/$CERT_NAME-ca.openssl.cnf"
SERVER_CSR="$CERT_DIR/$CERT_NAME.csr"
DAYS="${RIDE_TLS_DAYS:-}"
RENEW_BEFORE_DAYS="${RIDE_TLS_RENEW_BEFORE_DAYS:-30}"

read_env_value() {
  key="$1"
  file="$ROOT_DIR/.env"
  if [ ! -f "$file" ]; then
    return 0
  fi
  sed -n "s/^$key=//p" "$file" | tail -n 1
}

if [ -z "${RIDE_HTTPS_HOSTS:-}" ]; then
  RIDE_HTTPS_HOSTS=$(read_env_value RIDE_HTTPS_HOSTS)
fi

if [ -z "$DAYS" ]; then
  DAYS=$(read_env_value RIDE_TLS_DAYS)
fi
if [ -z "$DAYS" ]; then
  DAYS=825
fi

if [ "${RIDE_SKIP_CERT_GENERATION:-false}" = "true" ]; then
  if [ ! -f "$CERT_FILE" ] || [ ! -f "$KEY_FILE" ]; then
    echo "RIDE_SKIP_CERT_GENERATION=true, but the configured certificate files were not found." >&2
    echo "Expected certificate: $CERT_FILE" >&2
    echo "Expected private key: $KEY_FILE" >&2
    exit 1
  fi
  echo "Skipping HTTPS certificate generation; using existing certificate files."
  exit 0
fi

default_hosts() {
  printf 'localhost,127.0.0.1,::1'
  host=$(hostname 2>/dev/null || true)
  if [ -n "$host" ] && [ "$host" != "localhost" ]; then
    printf ',%s' "$host"
  fi
  fqdn=$(hostname -f 2>/dev/null || true)
  if [ -n "$fqdn" ] && [ "$fqdn" != "$host" ] && [ "$fqdn" != "localhost" ]; then
    printf ',%s' "$fqdn"
  fi
  ips=$(hostname -I 2>/dev/null || true)
  for ip in $ips; do
    printf ',%s' "$ip"
  done
}

if [ -z "${RIDE_HTTPS_HOSTS:-}" ]; then
  RIDE_HTTPS_HOSTS=$(default_hosts)
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl is required to generate HTTPS certificates." >&2
  exit 1
fi

mkdir -p "$CERT_DIR"

dns_index=1
ip_index=1
san_lines=''
normalized_hosts=''
common_name=''
seen=','

old_ifs=$IFS
IFS=','
set -- $RIDE_HTTPS_HOSTS
IFS=$old_ifs

for raw_host do
  host=$(printf '%s' "$raw_host" | sed 's/^ *//;s/ *$//')
  [ -n "$host" ] || continue
  case "$seen" in
    *",$host,"*) continue ;;
  esac
  seen="$seen$host,"
  normalized_hosts="${normalized_hosts}${normalized_hosts:+,}$host"
  if [ -z "$common_name" ]; then
    common_name="$host"
  fi

  case "$host" in
    *:*)
      san_lines="${san_lines}IP.$ip_index = $host
"
      ip_index=$((ip_index + 1))
      ;;
    *)
      if printf '%s' "$host" | grep -Eq '^[0-9]{1,3}(\.[0-9]{1,3}){3}$'; then
        san_lines="${san_lines}IP.$ip_index = $host
"
        ip_index=$((ip_index + 1))
      else
        san_lines="${san_lines}DNS.$dns_index = $host
"
        dns_index=$((dns_index + 1))
      fi
      ;;
  esac
done

if [ -z "$normalized_hosts" ]; then
  echo "No HTTPS hosts were configured." >&2
  exit 1
fi

if [ "${FORCE_RENEW:-0}" != "1" ] && [ -f "$CERT_FILE" ] && [ -f "$KEY_FILE" ]; then
  renew_seconds=$((RENEW_BEFORE_DAYS * 24 * 60 * 60))
  previous_hosts=$(cat "$HOSTS_FILE" 2>/dev/null || true)
  if [ "$previous_hosts" = "$normalized_hosts" ] \
    && [ -f "$CA_CERT_FILE" ] \
    && [ -f "$CA_KEY_FILE" ] \
    && openssl verify -CAfile "$CA_CERT_FILE" "$CERT_FILE" >/dev/null 2>&1 \
    && openssl x509 -checkend "$renew_seconds" -noout -in "$CERT_FILE" >/dev/null 2>&1; then
    echo "HTTPS certificate already valid for: $normalized_hosts"
    exit 0
  fi
fi

umask 077
if [ "${FORCE_RENEW_CA:-0}" = "1" ] \
  || [ ! -f "$CA_CERT_FILE" ] \
  || [ ! -f "$CA_KEY_FILE" ] \
  || ! openssl x509 -checkend "$((RENEW_BEFORE_DAYS * 24 * 60 * 60))" -noout -in "$CA_CERT_FILE" >/dev/null 2>&1; then
  {
    printf '%s\n' '[req]'
    printf '%s\n' 'default_bits = 2048'
    printf '%s\n' 'prompt = no'
    printf '%s\n' 'default_md = sha256'
    printf '%s\n' 'distinguished_name = dn'
    printf '%s\n' 'x509_extensions = v3_ca'
    printf '\n%s\n' '[dn]'
    printf '%s\n' 'CN = Ride Local CA'
    printf '\n%s\n' '[v3_ca]'
    printf '%s\n' 'basicConstraints = critical,CA:TRUE,pathlen:0'
    printf '%s\n' 'keyUsage = critical,keyCertSign,cRLSign'
    printf '%s\n' 'subjectKeyIdentifier = hash'
    printf '%s\n' 'authorityKeyIdentifier = keyid:always,issuer'
  } > "$CA_CONFIG"

  openssl req \
    -x509 \
    -newkey rsa:2048 \
    -sha256 \
    -nodes \
    -days "$DAYS" \
    -keyout "$CA_KEY_FILE" \
    -out "$CA_CERT_FILE" \
    -config "$CA_CONFIG" >/dev/null 2>&1
fi

{
  printf '%s\n' '[req]'
  printf '%s\n' 'default_bits = 2048'
  printf '%s\n' 'prompt = no'
  printf '%s\n' 'default_md = sha256'
  printf '%s\n' 'distinguished_name = dn'
  printf '%s\n' 'req_extensions = v3_req'
  printf '\n%s\n' '[dn]'
  printf 'CN = %s\n' "$common_name"
  printf '\n%s\n' '[v3_req]'
  printf '%s\n' 'basicConstraints = critical,CA:FALSE'
  printf '%s\n' 'keyUsage = critical,digitalSignature, keyEncipherment'
  printf '%s\n' 'extendedKeyUsage = serverAuth'
  printf '%s\n' 'subjectAltName = @alt_names'
  printf '%s\n' 'subjectKeyIdentifier = hash'
  printf '\n%s\n' '[alt_names]'
  printf '%s' "$san_lines"
} > "$OPENSSL_CONFIG"

openssl req \
  -new \
  -newkey rsa:2048 \
  -sha256 \
  -nodes \
  -keyout "$KEY_FILE" \
  -out "$SERVER_CSR" \
  -config "$OPENSSL_CONFIG" >/dev/null 2>&1

openssl x509 \
  -req \
  -in "$SERVER_CSR" \
  -CA "$CA_CERT_FILE" \
  -CAkey "$CA_KEY_FILE" \
  -CAserial "$CA_SERIAL_FILE" \
  -CAcreateserial \
  -out "$CERT_FILE" \
  -days "$DAYS" \
  -sha256 \
  -extensions v3_req \
  -extfile "$OPENSSL_CONFIG" >/dev/null 2>&1

chmod 600 "$KEY_FILE"
chmod 600 "$CA_KEY_FILE"
chmod 644 "$CERT_FILE"
chmod 644 "$CA_CERT_FILE"
rm -f "$SERVER_CSR"
printf '%s\n' "$normalized_hosts" > "$HOSTS_FILE"

echo "Generated HTTPS certificate:"
echo "  install on Android: $CA_CERT_FILE"
echo "  certificate: $CERT_FILE"
echo "  private key: $KEY_FILE"
echo "  hosts: $normalized_hosts"
