#!/usr/bin/env bash
set -euo pipefail

mkdir -p backups
stamp="$(date +%Y-%m-%d-%H%M%S)"
target="backups/expenses-${stamp}.db"

if docker compose ps --services --filter status=running | grep -qx "expense-bot"; then
  docker compose exec -T expense-bot sh -c "node -e \"const Database=require('better-sqlite3'); const db=new Database(process.env.DATABASE_PATH); db.prepare('VACUUM INTO ?').run('/app/data/backup-tmp.db'); db.close();\""
  cp data/backup-tmp.db "$target"
  rm -f data/backup-tmp.db
else
  db_path="${DATABASE_PATH:-data/expenses.db}"
  sqlite3 "$db_path" ".backup '$target'"
fi

if [[ "${KEEP_DAYS:-}" =~ ^[0-9]+$ ]]; then
  find backups -name "expenses-*.db" -type f -mtime +"$KEEP_DAYS" -delete
fi

echo "Backup created: $target"
