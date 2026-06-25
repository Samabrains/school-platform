/**
 * Delete a tenant and all Cloudflare resources (for test resets).
 *
 *   npm run tenant:delete -- --slug=green-valley-academy
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TEMPLATE = path.resolve(ROOT, "..", "core-school-template");
const ACCOUNT_ID = "17ac8e645ffc2337eceac4d16704fc96";

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : null;
}

function loadEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (val) out[key] = val;
  }
  return out;
}

const slug = arg("slug");
if (!slug) {
  console.error("Usage: node scripts/delete-tenant.mjs --slug=<name>");
  process.exit(1);
}

const secrets = loadEnvFile(path.join(ROOT, "secrets.local.env"));
const token = secrets.CLOUDFLARE_API_TOKEN ?? process.env.CLOUDFLARE_API_TOKEN;
const env = { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID };

function run(cmd, opts = {}) {
  console.log(`→ ${cmd}`);
  try {
    execSync(cmd, {
      stdio: "inherit",
      cwd: opts.cwd ?? ROOT,
      env,
      ...opts,
    });
  } catch (err) {
    console.warn(`  (skipped or failed: ${err.message?.split("\n")[0] ?? err})`);
  }
}

async function cfDelete(pathSuffix) {
  if (!token) {
    console.warn("No CLOUDFLARE_API_TOKEN — skip API delete", pathSuffix);
    return;
  }
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}${pathSuffix}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  const data = await res.json();
  if (!data.success) {
    console.warn(`  API delete ${pathSuffix}:`, JSON.stringify(data.errors));
  } else {
    console.log(`  ✓ deleted ${pathSuffix}`);
  }
}

function d1Execute(sql) {
  const escaped = sql.replace(/"/g, '\\"');
  run(
    `npx wrangler d1 execute samabrains-platform-d1 --remote --command "${escaped}"`
  );
}

async function main() {
  console.log(`\n=== Deleting tenant: ${slug} ===\n`);

  const lookup = execSync(
    `npx wrangler d1 execute samabrains-platform-d1 --remote --command "SELECT id, d1_database_id FROM tenants WHERE slug='${slug.replace(/'/g, "''")}'" --json`,
    { cwd: ROOT, env, encoding: "utf-8" }
  );
  let tenantId = null;
  let d1Id = null;
  try {
    const parsed = JSON.parse(lookup);
    const row = parsed?.[0]?.results?.[0];
    tenantId = row?.id ?? null;
    d1Id = row?.d1_database_id ?? null;
  } catch {
    /* no row */
  }

  const dbName = `${slug}-d1-production`;
  const r2Main = `${slug}-r2-production`;
  const r2Backups = `${slug}-r2-backups-prod`;
  const vectorIndex = `${slug}-handbook-prod`;

  await cfDelete(`/pages/projects/${encodeURIComponent(slug)}`);

  if (d1Id) {
    await cfDelete(`/d1/database/${d1Id}`);
  } else {
    run(`npx wrangler d1 delete ${dbName} --skip-confirmation`);
  }

  await cfDelete(`/r2/buckets/${r2Main}`);
  await cfDelete(`/r2/buckets/${r2Backups}`);
  await cfDelete(`/vectorize/indexes/${vectorIndex}`);

  const tenantConfig = path.join(TEMPLATE, "scripts", "tenants", `${slug}.wrangler.toml`);
  if (fs.existsSync(tenantConfig)) {
    fs.unlinkSync(tenantConfig);
    console.log(`  ✓ removed ${tenantConfig}`);
  }

  if (tenantId) {
    console.log("\nCleaning platform database…");
    d1Execute(`DELETE FROM provisioning_jobs WHERE tenant_id='${tenantId}'`);
    d1Execute(`DELETE FROM billing_events WHERE tenant_id='${tenantId}'`);
    d1Execute(`DELETE FROM admin_magic_links WHERE tenant_id='${tenantId}'`);
    d1Execute(`DELETE FROM notification_log WHERE tenant_id='${tenantId}'`);
    d1Execute(
      `DELETE FROM tenant_deployments WHERE tenant_id='${tenantId}'`
    );
    d1Execute(`DELETE FROM tenants WHERE id='${tenantId}'`);
    console.log(`  ✓ removed tenant ${tenantId}`);
  } else {
    d1Execute(`DELETE FROM tenants WHERE slug='${slug.replace(/'/g, "''")}'`);
  }

  console.log("\n=== Done ===");
  console.log(`You can sign up again at /signup with slug: ${slug}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
