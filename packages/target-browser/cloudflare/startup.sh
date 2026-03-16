#!/bin/bash
set -e

echo "=== DeltEcho Container Startup ==="
echo "Date: $(date)"
echo "Node version: $(node --version)"

# ─── Configuration ────────────────────────────────────────────────────
ACCOUNTS_DIR="/data/accounts"
ACCOUNTS_TOML="$ACCOUNTS_DIR/accounts.toml"
BACKUP_INTERVAL=300  # Backup every 5 minutes
EXTERNAL_URL="${DELTECHO_EXTERNAL_URL:-}"

echo "External URL for R2 backup: ${EXTERNAL_URL:-not set}"
echo "Checking deltachat-rpc-server:"
ls -la /usr/local/bin/deltachat-rpc-server || echo "Binary not found"

# ─── Restore from R2 ─────────────────────────────────────────────────
restore_from_r2() {
    if [ -z "$EXTERNAL_URL" ]; then
        echo "[Restore] No EXTERNAL_URL set, skipping R2 restore"
        return 1
    fi

    echo "[Restore] Checking R2 for account backup..."
    local status_code
    status_code=$(curl -s -o /tmp/restore-status.json -w "%{http_code}" \
        "${EXTERNAL_URL}/backend-api/accounts/status" 2>/dev/null || echo "000")

    if [ "$status_code" != "200" ]; then
        echo "[Restore] Could not reach backup status endpoint (HTTP $status_code)"
        return 1
    fi

    # Parse JSON without python (use grep/sed for minimal deps)
    local exists
    exists=$(grep -o '"exists":[^,}]*' /tmp/restore-status.json | head -1 | sed 's/.*://' | tr -d ' ')

    if [ "$exists" != "true" ]; then
        echo "[Restore] No backup found in R2, starting fresh"
        return 1
    fi

    echo "[Restore] Found backup, downloading..."
    local dl_code
    dl_code=$(curl -s -o /tmp/accounts-backup.tar.gz -w "%{http_code}" \
        "${EXTERNAL_URL}/backend-api/accounts/restore" 2>/dev/null || echo "000")

    if [ "$dl_code" != "200" ]; then
        echo "[Restore] Failed to download backup (HTTP $dl_code)"
        return 1
    fi

    local file_size
    file_size=$(stat -c%s /tmp/accounts-backup.tar.gz 2>/dev/null || echo "0")
    echo "[Restore] Downloaded backup: ${file_size} bytes"

    if [ "$file_size" -lt 100 ]; then
        echo "[Restore] Backup file too small, likely corrupt. Skipping."
        return 1
    fi

    echo "[Restore] Extracting backup to $ACCOUNTS_DIR..."
    rm -rf "$ACCOUNTS_DIR"/*
    cd /data
    tar xzf /tmp/accounts-backup.tar.gz 2>/dev/null || {
        echo "[Restore] Failed to extract backup, starting fresh"
        mkdir -p "$ACCOUNTS_DIR"
        return 1
    }

    rm -f /tmp/accounts-backup.tar.gz
    echo "[Restore] Account data restored successfully!"
    ls -la "$ACCOUNTS_DIR/" 2>/dev/null || true
    return 0
}

# ─── Backup to R2 ────────────────────────────────────────────────────
backup_to_r2() {
    if [ -z "$EXTERNAL_URL" ]; then
        return 0
    fi

    # Check if there's actual account data to backup
    local file_count
    file_count=$(find "$ACCOUNTS_DIR" -type f | wc -l)
    if [ "$file_count" -le 1 ]; then
        return 0
    fi

    echo "[Backup] Creating account backup ($file_count files)..."
    cd /data
    tar czf /tmp/accounts-backup.tar.gz accounts/ 2>/dev/null || {
        echo "[Backup] Failed to create tar archive"
        return 1
    }

    local file_size
    file_size=$(stat -c%s /tmp/accounts-backup.tar.gz 2>/dev/null || echo "0")
    echo "[Backup] Archive size: ${file_size} bytes"

    local upload_code
    upload_code=$(curl -s -o /tmp/backup-result.json -w "%{http_code}" \
        -X POST \
        -H "Content-Type: application/gzip" \
        --data-binary @/tmp/accounts-backup.tar.gz \
        "${EXTERNAL_URL}/backend-api/accounts/backup" 2>/dev/null || echo "000")

    rm -f /tmp/accounts-backup.tar.gz

    if [ "$upload_code" = "200" ]; then
        echo "[Backup] Account backup uploaded successfully"
    else
        echo "[Backup] Upload failed (HTTP $upload_code)"
    fi
}

# ─── Periodic Backup Loop ────────────────────────────────────────────
start_backup_loop() {
    while true; do
        sleep $BACKUP_INTERVAL
        backup_to_r2
    done
}

# ─── SIGTERM Handler ──────────────────────────────────────────────────
cleanup() {
    echo "[Shutdown] SIGTERM received, performing final backup..."
    backup_to_r2
    echo "[Shutdown] Final backup complete, exiting"
    if [ -n "$NODE_PID" ]; then
        kill -TERM "$NODE_PID" 2>/dev/null || true
        wait "$NODE_PID" 2>/dev/null || true
    fi
    exit 0
}

trap cleanup SIGTERM SIGINT

# ─── Main Startup ────────────────────────────────────────────────────

# Ensure data directories exist
mkdir -p "$ACCOUNTS_DIR" /data/logs /data/background

# Try to restore from R2
if restore_from_r2; then
    echo "=== Restored account data from R2 ==="
else
    echo "=== Starting with fresh account data ==="
    if [ ! -f "$ACCOUNTS_TOML" ]; then
        echo "Creating $ACCOUNTS_TOML..."
        cat > "$ACCOUNTS_TOML" << 'TOMLEOF'
selected_account = 0
next_id = 1
accounts = []
accounts_order = []
TOMLEOF
    fi
fi

# Fix accounts.toml format if needed
if [ -f "$ACCOUNTS_TOML" ] && grep -q '^\[accounts\]' "$ACCOUNTS_TOML"; then
    echo "Fixing accounts.toml format..."
    cat > "$ACCOUNTS_TOML" << 'TOMLEOF'
selected_account = 0
next_id = 1
accounts = []
accounts_order = []
TOMLEOF
fi

echo "Current accounts.toml:"
cat "$ACCOUNTS_TOML"
echo ""
ls -la "$ACCOUNTS_DIR/" || echo "Empty"

# Start periodic backup loop in background
if [ -n "$EXTERNAL_URL" ]; then
    echo "Starting periodic backup loop (every ${BACKUP_INTERVAL}s)..."
    start_backup_loop &
    BACKUP_PID=$!
fi

echo "=== Starting DeltEcho server ==="
node /app/dist/server.js &
NODE_PID=$!

# Wait for the node process
wait "$NODE_PID"
