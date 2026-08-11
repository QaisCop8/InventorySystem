#!/usr/bin/env bash
set -euo pipefail

echo "Starting ASAS installation..."

for command_name in node npm psql createdb pg_restore; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Missing required command: ${command_name}" >&2
    exit 1
  fi
done

db_host="${POSTGRES_HOST:-localhost}"
db_port="${POSTGRES_PORT:-5432}"
db_user="${POSTGRES_USER:-postgres}"
db_password="${POSTGRES_PASSWORD:-postgres}"
connection_root="postgresql://${db_user}:${db_password}@${db_host}:${db_port}"

if [[ ! -f .env.local ]]; then
  printf '%s\n' \
    '# Management and tenant database configuration' \
    "DATABASE_URL=\"${connection_root}/management\"" \
    '' \
    '# Replace this before production use' \
    'ENCRYPTION_KEY="change-this-to-a-long-random-key"' > .env.local
  echo "Created .env.local. DATABASE_URL points to the management database."
fi

set -a
# shellcheck disable=SC1091
source .env.local
set +a

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo ".env.local is missing DATABASE_URL." >&2
  exit 1
fi

npm install
bash scripts/bootstrap-databases.sh

echo "Installation complete. Run: npm run dev"
