#!/usr/bin/env bash
set -euo pipefail

if [ ! -f .env ]; then
  echo "Error: .env file not found (copy .sample.env to .env)" >&2
  exit 1
fi

set -a
source .env
set +a

if [ "${TARGET:-production}" = "development" ]; then
  docker compose -f docker-compose.yml -f docker-compose.development.yml up --build "$@"
else
  docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --build "$@"
fi

echo "TARGET=${TARGET:-production}"
