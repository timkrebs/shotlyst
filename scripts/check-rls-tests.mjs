// Fails when a table created in supabase/migrations has no RLS test file
// supabase/tests/<table>.test.sql (project rule 4). No dependencies.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(root, "supabase", "migrations");
const testsDir = join(root, "supabase", "tests");

const createTable = /create\s+table\s+(?:if\s+not\s+exists\s+)?"?public"?\s*\.\s*"?([a-z_][a-z0-9_]*)"?/gi;

const tables = new Set();
for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
  // Drop line comments so commented-out statements do not count.
  const sql = readFileSync(join(migrationsDir, file), "utf8").replace(/--.*$/gm, "");
  for (const match of sql.matchAll(createTable)) {
    tables.add(match[1].toLowerCase());
  }
}

if (tables.size === 0) {
  console.error(`No "create table public.<name>" found in ${migrationsDir}.`);
  process.exit(1);
}

const missing = [...tables].filter((t) => !existsSync(join(testsDir, `${t}.test.sql`))).sort();

if (missing.length > 0) {
  console.error("Tables without an RLS test:");
  for (const table of missing) {
    console.error(`  public.${table} -> supabase/tests/${table}.test.sql`);
  }
  process.exit(1);
}

console.log(`RLS tests: all ${tables.size} public tables have a test file in supabase/tests.`);
