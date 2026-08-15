#!/usr/bin/env bash
set -euo pipefail

# The official PostgreSQL image runs initialization with a temporary Unix-socket server.
# Use that socket here; application URLs use the Docker service name after startup.
socket_query="?host=/var/run/postgresql"
export DATABASE_URL="postgresql://${POSTGRES_USER}@/management${socket_query}"
export MANAGEMENT_SCHEMA_PATH="/bootstrap/scripts/management-schema.sql"

bash /bootstrap/scripts/bootstrap-databases.sh
