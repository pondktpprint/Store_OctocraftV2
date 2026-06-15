#!/bin/bash
# -----------------------------------------------------------------------------
# OctoCraft SMP Store Backup Script
# Performs a daily database backup, zips it, validates it, and retains 7 days.
# -----------------------------------------------------------------------------

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_ROOT/.env"
BACKUP_DIR="$PROJECT_ROOT/backups"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Source environment variables if .env exists
if [ -f "$ENV_FILE" ]; then
    export $(grep -v '^#' "$ENV_FILE" | xargs)
else
    echo "[ERROR] .env file not found at $ENV_FILE"
    exit 1
fi

# We only backup the main store DB, not nLogin (which is managed elsewhere)
if [ -z "$STORE_DB_NAME" ] || [ -z "$STORE_DB_USER" ] || [ -z "$STORE_DB_PASSWORD" ]; then
    echo "[ERROR] STORE_DB credentials missing in .env"
    exit 1
fi

DB_HOST=${STORE_DB_HOST:-127.0.0.1}
DB_PORT=${STORE_DB_PORT:-3306}
BACKUP_FILE="$BACKUP_DIR/${STORE_DB_NAME}_${TIMESTAMP}.sql.gz"

echo "================================================="
echo "Starting database backup: $TIMESTAMP"
echo "Target DB: $STORE_DB_NAME"
echo "================================================="

# 1. Execute mysqldump
echo "[1/4] Dumping database..."
mysqldump -h "$DB_HOST" -P "$DB_PORT" -u "$STORE_DB_USER" -p"$STORE_DB_PASSWORD" \
    --single-transaction \
    --quick \
    --lock-tables=false \
    "$STORE_DB_NAME" | gzip > "$BACKUP_FILE"

# 2. Verify Backup
echo "[2/4] Verifying backup integrity..."
if gzip -t "$BACKUP_FILE"; then
    echo "      Verification PASSED. Archive is valid."
else
    echo "      [ERROR] Verification FAILED. Archive is corrupted!"
    rm -f "$BACKUP_FILE"
    exit 1
fi

# 3. Print size
SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
echo "[3/4] Backup completed successfully. Size: $SIZE"

# 4. Enforce 7-Day Retention Policy
echo "[4/4] Applying 7-day retention policy..."
# Find files older than 7 days (*.sql.gz) and delete them
DELETED=$(find "$BACKUP_DIR" -type f -name "*.sql.gz" -mtime +7 -print -delete)
if [ -n "$DELETED" ]; then
    echo "      Deleted old backups:"
    echo "$DELETED"
else
    echo "      No old backups required deletion."
fi

echo "================================================="
echo "Backup Process Finished."
echo "File saved to: $BACKUP_FILE"
echo "================================================="
