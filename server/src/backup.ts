/**
 * Point-in-time backup of the database and every stored PDF.
 *
 * A single volume is a single point of failure, and for a signing product the
 * documents *are* the product. Run with: bun src/backup.ts [destination]
 */
import { Database } from "bun:sqlite";
import { mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, FILES_DIR } from "./db";

const dest = process.argv[2] ?? join(DATA_DIR, "backups");
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const target = join(dest, stamp);

mkdirSync(join(target, "files"), { recursive: true });

// VACUUM INTO takes a consistent snapshot even while the app is serving, which
// a plain file copy of a live WAL database does not.
const db = new Database(join(DATA_DIR, "docflow.sqlite"), { readonly: true });
db.exec(`VACUUM INTO '${join(target, "docflow.sqlite").replace(/'/g, "''")}'`);
db.close();

let count = 0;
let bytes = 0;
for (const name of readdirSync(FILES_DIR)) {
  const from = join(FILES_DIR, name);
  if (!statSync(from).isFile()) continue;
  await Bun.write(join(target, "files", name), Bun.file(from));
  count++;
  bytes += statSync(from).size;
}

console.log(`Backup written to ${target}`);
console.log(`  database snapshot + ${count} file(s), ${(bytes / 1e6).toFixed(1)} MB`);
console.log("Copy this directory off the machine — a backup on the same volume");
console.log("does not survive the failure it exists to protect against.");
