#!/bin/sh
set -eu

stamp="node_modules/.ride-package-lock.sha256"
current="$(sha256sum package-lock.json | cut -d ' ' -f 1)"

if [ -x apps/api/node_modules/.bin/nest ] && [ -x node_modules/.bin/vite ] && [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$current" ]; then
  echo "Ride dependencies are already installed."
  exit 0
fi

echo "Installing Ride workspace dependencies..."
npm ci
printf '%s\n' "$current" > "$stamp"
