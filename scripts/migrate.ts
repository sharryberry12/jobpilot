/** One-shot: create/upgrade the SQLite schema. `npm run db:migrate`. */
import { closeDb, getDb } from "../lib/db";

getDb();
console.log("[migrate] schema is up to date");
closeDb();
