/**
 * `npm run backup` — copies a consistent snapshot of the SQLite database plus
 * data/uploads and data/out into backups/jobpilot-YYYYMMDD-HHmm.zip (SPEC P5).
 */
import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import Database from "better-sqlite3";

const DB_PATH = path.resolve(process.cwd(), process.env.DB_PATH ?? path.join("data", "jobpilot.db"));
const BACKUP_DIR = path.resolve(process.cwd(), "backups");

function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`No database at ${DB_PATH} — nothing to back up.`);
    process.exit(1);
  }
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const target = path.join(BACKUP_DIR, `jobpilot-${stamp()}.zip`);
  const snapshot = path.join(BACKUP_DIR, `.snapshot-${process.pid}.db`);

  // VACUUM INTO writes a consistent copy even while the app is running (WAL mode).
  const db = new Database(DB_PATH, { readonly: true });
  try {
    db.exec(`VACUUM INTO '${snapshot.replace(/'/g, "''")}'`);
  } finally {
    db.close();
  }

  const zip = new AdmZip();
  zip.addLocalFile(snapshot, "", "jobpilot.db");
  for (const dir of ["uploads", "out"]) {
    const abs = path.join(path.dirname(DB_PATH), dir);
    if (fs.existsSync(abs)) zip.addLocalFolder(abs, dir);
  }
  zip.writeZip(target);
  fs.rmSync(snapshot, { force: true });

  const size = fs.statSync(target).size;
  console.log(`[backup] wrote ${path.relative(process.cwd(), target)} (${(size / 1024).toFixed(0)} KB)`);
}

main();
