# Production Backup Strategy

## Overview
This document outlines the disaster recovery and backup strategy for the OctoCraft SMP Store database. It establishes a resilient, automated process for securing the `STORE_DB` state.

Note: The `nLogin` database is managed independently by the game server infrastructure and is intentionally excluded from this e-commerce backup lifecycle.

## The Backup Script
A dedicated shell script has been created at `scripts/backup.sh`. It performs the following lifecycle:
1. **Extraction**: Connects to the database utilizing credentials directly from `.env` and executes a `mysqldump` utilizing `--single-transaction` to ensure ACID compliance without locking tables and disrupting player checkouts.
2. **Compression**: Streams the output directly through `gzip` to dramatically reduce storage footprint.
3. **Verification**: Executes `gzip -t` to mathematically verify the structural integrity of the compressed archive immediately after creation.
4. **Retention Policy**: Uses `find` to automatically purge any `.sql.gz` backups older than 7 days (`-mtime +7`), preventing infinite disk consumption.

## Setup Instructions

### 1. Traditional Linux (Cron)
If your application runs directly on a Linux host (e.g., Ubuntu/Debian), you can automate the script using the system's cron daemon.

1. Ensure the script is executable:
   ```bash
   chmod +x scripts/backup.sh
   ```
2. Open your crontab editor:
   ```bash
   crontab -e
   ```
3. Add the following line to execute the backup every day at 3:00 AM server time:
   ```cron
   0 3 * * * /absolute/path/to/Store_OctocraftV2/scripts/backup.sh >> /absolute/path/to/Store_OctocraftV2/backups/backup.log 2>&1
   ```

### 2. Docker Environments
If the database is running inside a Docker container (e.g., `mysql:8`), you can utilize a sidecar cron container, or simply execute the dump directly from the host machine using `docker exec`.

#### Docker Cron Example (Host Machine)
Add this to the host machine's crontab to execute the backup directly inside the container without needing `mysql-client` installed on the host.

```cron
0 3 * * * docker exec my-store-mysql sh -c 'exec mysqldump -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' | gzip > /absolute/path/to/backups/store_backup_$(date +\%F).sql.gz
```
*Note: To enforce the 7-day retention in this mode, you would append a standard `find` command to the cron job.*

## Restore Instructions
In the event of a catastrophic failure, follow these steps to restore the database to a previous state:

1. **Locate the Backup**: Navigate to the `backups/` directory and locate the desired `.sql.gz` archive.
2. **Decompress and Inject**: Run the following command from the terminal, replacing `<backup_file.sql.gz>` with your archive:
   ```bash
   gunzip < backups/<backup_file.sql.gz> | mysql -h 127.0.0.1 -u <STORE_DB_USER> -p <STORE_DB_NAME>
   ```
3. **Verify Restoration**: Start the backend and verify functionality using the Admin Dashboard.
