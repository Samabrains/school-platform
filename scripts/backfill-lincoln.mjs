/**
 * Backfill Lincoln Academy into the platform DB (for pre-platform tenants).
 *   node scripts/backfill-lincoln.mjs
 *   node scripts/backfill-lincoln.mjs --dry-run
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const seedPath = path.join(ROOT, "scripts/seeds/lincoln-academy.json");

const dryRun = process.argv.includes("--dry-run");
const seed = JSON.parse(fs.readFileSync(seedPath, "utf-8"));

const sql = `INSERT INTO tenants (
  id, slug, school_name, admin_email, status, plan, billing_status,
  trial_ends_at, pesapal_account_number, pages_project_name, production_url,
  d1_database_id, r2_bucket, vectorize_index, created_at, provisioned_at
) VALUES (
  '${seed.id}',
  '${seed.slug}',
  '${seed.school_name.replace(/'/g, "''")}',
  '${seed.admin_email}',
  '${seed.status}',
  '${seed.plan}',
  '${seed.billing_status}',
  ${seed.trial_ends_at ?? "NULL"},
  '${seed.pesapal_account_number}',
  '${seed.pages_project_name}',
  '${seed.production_url}',
  '${seed.d1_database_id}',
  '${seed.r2_bucket}',
  '${seed.vectorize_index}',
  ${seed.created_at},
  ${seed.provisioned_at}
) ON CONFLICT(id) DO UPDATE SET
  slug = excluded.slug,
  school_name = excluded.school_name,
  admin_email = excluded.admin_email,
  status = excluded.status,
  plan = excluded.plan,
  billing_status = excluded.billing_status,
  production_url = excluded.production_url,
  d1_database_id = excluded.d1_database_id,
  r2_bucket = excluded.r2_bucket,
  vectorize_index = excluded.vectorize_index,
  provisioned_at = excluded.provisioned_at`;

if (dryRun) {
  console.log("Dry run — SQL:\n", sql);
  process.exit(0);
}

execSync(
  `npx wrangler d1 execute samabrains-platform-d1 --remote --command "${sql.replace(/"/g, '\\"')}"`,
  { cwd: ROOT, stdio: "inherit" }
);

console.log("Lincoln Academy backfilled:", seed.slug);
