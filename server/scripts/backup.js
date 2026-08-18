// scripts/backup.js
//
// Zips the SQLite DB + uploads folder into server/backups/<timestamp>.zip.
// Run manually (`node scripts/backup.js`) or wire up to Windows Task
// Scheduler for a nightly job. This is a local-disk setup, so this file IS
// your disaster recovery plan until/unless you move to object storage.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const BACKUP_DIR = path.join(ROOT, "backups");
fs.mkdirSync(BACKUP_DIR, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outFile = path.join(BACKUP_DIR, `backup-${stamp}.zip`);

// Uses the system `zip` binary (present on macOS/Linux; on Windows, install
// via Git Bash/WSL, or swap this for a PowerShell Compress-Archive call).
try {
  execFileSync("zip", ["-r", outFile, "db", "uploads", "-x", "db/*.sqlite-shm", "db/*.sqlite-wal"], {
    cwd: ROOT,
    stdio: "inherit",
  });
  console.log(`Backup written to ${outFile}`);
} catch (err) {
  console.error("Backup failed - is `zip` installed and on PATH?", err.message);
  process.exit(1);
}
