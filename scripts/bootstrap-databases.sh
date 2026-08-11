#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dump_path="${DATABASE_DUMP_PATH:-${root_dir}/backupDB.sql}"
management_schema_path="${MANAGEMENT_SCHEMA_PATH:-${root_dir}/scripts/management-schema.sql}"
management_url="${DATABASE_URL:-}"
template_db="company_template"

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
template_url="${connection_root}/${template_db}${url_query}"

for command_name in psql createdb pg_restore; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "${command_name} is required to bootstrap the databases." >&2
    exit 1
  fi
done

if [[ ! -f "${dump_path}" ]]; then
  echo "Company template dump not found: ${dump_path}" >&2
  exit 1
fi

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

create_database_if_missing "${template_db}"
if [[ "$(psql "${template_url}" -tAc "SELECT current_database()")" != "${template_db}" ]]; then
  echo "Internal company template URL does not connect to ${template_db}." >&2
  exit 1
fi
template_ready="$(psql "${template_url}" -tAc "SELECT to_regclass('public.user_settings') IS NOT NULL")"
if [[ "${template_ready}" != "t" ]]; then
  public_table_count="$(psql "${template_url}" -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'")"
  if [[ "${public_table_count}" != "0" ]]; then
    echo "${template_db} is partially initialized. Drop only that template database and rerun this script." >&2
    exit 1
  fi

  pg_restore --exit-on-error --schema-only --no-owner --no-privileges --dbname="${template_url}" "${dump_path}"

  lookup_tables=(
    voucher_types_tbl voucher_books_tbl voucher_status_tbl voucher_journal_type_tbl
    voucher_journal_type_caption_tbl account_classification_types balance_sheet_assets_items
    balance_sheet_liabilities_items income_statement_items payment_classifications_tbl
    tax_classifications pricecategory measurment_types_tbl cities cheque_status_tbl
    cheque_book_status_tbl cheques_type_tbl credit_card_main_types_tbl
    credit_card_commission_types_tbl workflow_stages workflow_sequences
    workflow_sequence_steps access_category access_list
  )
  for table_name in "${lookup_tables[@]}"; do
    pg_restore --exit-on-error --data-only --no-owner --no-privileges \
      --table="public.${table_name}" --dbname="${template_url}" "${dump_path}"
  done
fi

echo "Database bootstrap complete: management + ${template_db}"
