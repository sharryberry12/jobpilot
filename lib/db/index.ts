/**
 * SQLite connection singleton (SPEC §2: single file data/jobpilot.db).
 *
 * - Cached on globalThis so Next.js HMR does not open a connection per reload.
 * - Migrations in ./drizzle are applied on first open, so a fresh clone boots
 *   with `npm run dev` and no extra step.
 * - DB_PATH env var overrides the location (tests use ":memory:").
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

const DEFAULT_DB_PATH = path.join("data", "jobpilot.db");
const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

type DbGlobal = typeof globalThis & { __jobpilotDb?: Db; __jobpilotSqlite?: Database.Database };
const g = globalThis as DbGlobal;

export function openDatabase(dbPath: string = process.env.DB_PATH ?? DEFAULT_DB_PATH): {
  db: Db;
  sqlite: Database.Database;
} {
  const resolved = dbPath === ":memory:" ? dbPath : path.resolve(process.cwd(), dbPath);
  if (resolved !== ":memory:") {
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
  }
  const sqlite = new Database(resolved);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return { db, sqlite };
}

/** Process-wide database handle. */
export function getDb(): Db {
  if (!g.__jobpilotDb) {
    const { db, sqlite } = openDatabase();
    g.__jobpilotDb = db;
    g.__jobpilotSqlite = sqlite;
  }
  return g.__jobpilotDb;
}

export function closeDb(): void {
  g.__jobpilotSqlite?.close();
  g.__jobpilotDb = undefined;
  g.__jobpilotSqlite = undefined;
}

export { schema };
