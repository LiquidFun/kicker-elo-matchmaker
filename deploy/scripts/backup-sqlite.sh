#!/usr/bin/env bash
# Nightly SQLite backup. Install with cron:
#   sudo crontab -u kicker -e
#   0 4 * * * /opt/kicker/deploy/scripts/backup-sqlite.sh
set -euo pipefail

DB="/opt/kicker/backend/kicker.db"
DEST="/opt/kicker/backups"
KEEP_DAYS=30

mkdir -p "$DEST"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT="$DEST/kicker-$STAMP.db"

# .backup uses online backup API — safe with WAL & concurrent readers/writers.
sqlite3 "$DB" ".backup '$OUT'"
gzip -f "$OUT"

find "$DEST" -name 'kicker-*.db.gz' -mtime +$KEEP_DAYS -delete
