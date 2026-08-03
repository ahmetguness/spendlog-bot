#!/usr/bin/env bash
set -euo pipefail

backup_file="${1:-}"
if [[ -z "$backup_file" || ! -f "$backup_file" ]]; then
  echo "Usage: scripts/restore.sh backups/expenses-YYYY-MM-DD-HHMMSS.db" >&2
  exit 1
fi

docker compose down
mkdir -p data
cp "$backup_file" data/expenses.db
docker compose up -d
