#!/usr/bin/env sh
set -eu

PROJECT_DIR="${PROJECT_DIR:-/opt/asas/app}"
BACKUP_DIR="${BACKUP_DIR:-/opt/asas/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
TIMESTAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
BACKUP_FILE="${BACKUP_DIR}/all-databases-${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"
umask 077

cd "${PROJECT_DIR}"
docker compose --env-file .env.production -f compose.production.yml exec -T database \
  sh -c 'pg_dumpall --clean --if-exists -U "$POSTGRES_USER"' | gzip -9 > "${BACKUP_FILE}"

gzip -t "${BACKUP_FILE}"
find "${BACKUP_DIR}" -type f -name 'all-databases-*.sql.gz' -mtime "+${RETENTION_DAYS}" -delete

echo "Database backup created: ${BACKUP_FILE}"

