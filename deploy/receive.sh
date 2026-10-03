#!/bin/sh
# Receives a new version of Musical Score Assistant on standard input (a gzipped tar with
# app/ and songs/) and switches to it. If the new version does not answer, the previous one
# is put back. Installed on the server as bin/receive by `npm run deploy -- --setup`; the
# deploy key of GitHub Actions may run nothing else. See docs/deployment.md.
set -eu

APP_HOME="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_HOME"

if [ ! -f .env ] || [ ! -f compose.yaml ]; then
  echo "The server is not set up yet: run npm run deploy -- --setup." >&2
  exit 1
fi

# Whatever happens, no half-extracted upload stays behind.
trap 'rm -rf "$APP_HOME/incoming"' EXIT
rm -rf incoming
mkdir incoming
tar -xzf - -C incoming --no-same-owner --no-same-permissions
if [ ! -f incoming/app/dist/index.html ] || [ ! -f incoming/app/dist-server/main.js ] ||
  [ ! -d incoming/songs ]; then
  echo "The upload is incomplete; nothing was changed." >&2
  rm -rf incoming
  exit 1
fi

healthy() {
  for attempt in $(seq 1 30); do
    if curl -fsS http://127.0.0.1:3020/api/health >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  return 1
}

mkdir -p data
rm -rf app.previous songs.previous
if [ -d app ]; then mv app app.previous; fi
if [ -d songs ]; then mv songs songs.previous; fi
mv incoming/app app
mv incoming/songs songs
rmdir incoming

# The container mounts the folders it was started with, so it is created afresh.
docker compose up -d --force-recreate --remove-orphans 2>&1
if healthy; then
  echo "healthy"
  exit 0
fi

echo "The new version did not answer; going back to the previous one." >&2
docker compose logs --tail 40 >&2 || true
if [ -d app.previous ] && [ -d songs.previous ]; then
  rm -rf app.failed songs.failed
  mv app app.failed
  mv songs songs.failed
  mv app.previous app
  mv songs.previous songs
  docker compose up -d --force-recreate 2>&1
  if healthy; then echo "The previous version is back." >&2; fi
fi
exit 1
