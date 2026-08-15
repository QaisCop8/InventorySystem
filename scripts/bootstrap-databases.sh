#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
management_schema_path="${MANAGEMENT_SCHEMA_PATH:-${root_dir}/scripts/management-schema.sql}"
management_url="${DATABASE_URL:-}"

if [[ -z "${management_url}" ]]; then
  echo "DATABASE_URL is required and must connect to management." >&2
  exit 1
fi

url_without_query="${management_url%%\?*}"
url_query=""
if [[ "${management_url}" == *"?"* ]]; then
  url_query="?${management_url#*\?}"
fi
connection_root="${url_without_query%/*}"
admin_url="${connection_root}/postgres${url_query}"

for command_name in psql createdb; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "${command_name} is required to bootstrap the databases." >&2
    exit 1
  fi
done

create_database_if_missing() {
  local database_name="$1"
  if [[ "$(psql "${admin_url}" -tAc "SELECT 1 FROM pg_database WHERE datname = '${database_name}'")" != "1" ]]; then
    createdb --maintenance-db="${admin_url}" "${database_name}"
  fi
}

create_database_if_missing "management"
if [[ "$(psql "${management_url}" -tAc "SELECT current_database()")" != "management" ]]; then
  echo "DATABASE_URL must connect to the management database." >&2
  exit 1
fi
psql "${management_url}" -v ON_ERROR_STOP=1 -f "${management_schema_path}"

echo "Database bootstrap complete: management only. Each company is created as an empty database and restored from the project dump during provisioning."
