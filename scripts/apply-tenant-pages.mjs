/**
 * Apply Pages bindings/secrets for a tenant after direct-upload deploy.
 *   node scripts/apply-tenant-pages.mjs --slug=green-valley-academy
 */
import { execSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ACCOUNT_ID = "17ac8e645ffc2337eceac4d16704fc96";

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : null;
}

function loadEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

const slug = arg("slug");
if (!slug) {
  console.error("Usage: node scripts/apply-tenant-pages.mjs --slug=<name>");
  process.exit(1);
}

const secrets = loadEnvFile(path.join(ROOT, "secrets.local.env"));
const token = secrets.CLOUDFLARE_API_TOKEN;
if (!token) {
  console.error("CLOUDFLARE_API_TOKEN required in secrets.local.env");
  process.exit(1);
}

const env = { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID };
const lookup = execSync(
  `npx wrangler d1 execute samabrains-platform-d1 --remote --command "SELECT * FROM tenants WHERE slug='${slug.replace(/'/g, "''")}'" --json`,
  { cwd: ROOT, env, encoding: "utf-8" }
);
const tenant = JSON.parse(lookup)[0]?.results?.[0];
if (!tenant?.d1_database_id) {
  console.error("Tenant not found or missing d1_database_id");
  process.exit(1);
}

const cronSecret =
  tenant.cron_secret ?? crypto.randomUUID() + crypto.randomUUID();
if (!tenant.cron_secret) {
  execSync(
    `npx wrangler d1 execute samabrains-platform-d1 --remote --command "UPDATE tenants SET cron_secret='${cronSecret}' WHERE id='${tenant.id}'"`,
    { cwd: ROOT, env, stdio: "inherit" }
  );
}

const isStarter = tenant.plan === "starter";
const jwtSecret = crypto.randomUUID() + crypto.randomUUID();
const envVars = {};

function addSecret(key, value) {
  if (value) envVars[key] = { type: "secret_text", value };
}
function addPlain(key, value) {
  if (value) envVars[key] = { type: "plain_text", value };
}

addSecret("JWT_SECRET", jwtSecret);
addSecret("CRON_SECRET", cronSecret);
addSecret("PLATFORM_AUTH_SECRET", secrets.PLATFORM_AUTH_SECRET ?? "");
addSecret("BREVO_API_KEY", secrets.BREVO_API_KEY ?? "");
addPlain("ADMIN_EMAIL", tenant.admin_email);
addPlain("NEXT_PUBLIC_SCHOOL_EMAIL", tenant.admin_email);
addPlain("NEXT_PUBLIC_ENABLE_ADMIN_PIN", "false");
addPlain("PLATFORM_TENANT_ID", tenant.id);
addPlain("PLATFORM_API_URL", "https://school-platform.ssebasamatha.workers.dev");
addPlain("TENANT_BILLING_STATUS", "trial");
addPlain("TRIAL_ENDS_AT", String(tenant.trial_ends_at));
addPlain("CLOUDFLARE_D1_DATABASE_ID", tenant.d1_database_id);
addPlain("CLOUDFLARE_ACCOUNT_ID", ACCOUNT_ID);
addPlain("CONTACT_EMAIL_TO", tenant.admin_email);
addPlain("BREVO_SENDER_EMAIL", secrets.BREVO_SENDER_EMAIL ?? "noreply@samabrains.com");
addPlain("NEXT_PUBLIC_SCHOOL_NAME", tenant.school_name);
addPlain("NEXT_PUBLIC_TAGLINE", tenant.tagline || "Excellence in Every Classroom");
addPlain("NEXT_PUBLIC_PRIMARY_COLOR", tenant.primary_color || "#1E3A8A");
addPlain("NEXT_PUBLIC_SECONDARY_COLOR", tenant.secondary_color || "#F59E0B");
addPlain("NEXT_PUBLIC_ENABLE_CHATBOT", "true");
addPlain("NEXT_PUBLIC_ENABLE_ALUMNI_PORTAL", isStarter ? "false" : "true");
addPlain("NEXT_PUBLIC_ENABLE_CAREERS", isStarter ? "false" : "true");
addPlain("NODE_VERSION", "22");

const body = {
  deployment_configs: {
    production: {
      compatibility_date: "2024-09-23",
      compatibility_flags: ["nodejs_compat"],
      usage_model: "standard",
      d1_databases: { DB: { id: tenant.d1_database_id } },
      r2_buckets: {
        STORAGE: { name: `${slug}-r2-production` },
        BACKUPS_STORAGE: { name: `${slug}-r2-backups-prod` },
      },
      vectorize_bindings: {
        VECTORIZE_INDEX: { index_name: `${slug}-handbook-prod` },
      },
      ai_bindings: {
        AI: {},
      },
      env_vars: envVars,
    },
  },
};

const res = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects/${slug}`,
  {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }
);
const data = await res.json();
if (!data.success) {
  console.error("Pages config failed:", JSON.stringify(data.errors, null, 2));
  process.exit(1);
}
console.log("✓ Pages bindings and env applied");

const redeploy = process.argv.includes("--redeploy");
if (redeploy) {
  const deployRes = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects/${slug}/deployments`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ branch: "main" }),
    }
  );
  const deployData = await deployRes.json();
  if (!deployData.success) {
    console.error("Redeploy failed:", JSON.stringify(deployData.errors));
    process.exit(1);
  }
  console.log("✓ Triggered production redeploy");
}

const siteUrl = `https://${slug}.pages.dev`;
const boot = await fetch(`${siteUrl}/api/admin/bootstrap`, {
  method: "POST",
  headers: { Authorization: `Bearer ${cronSecret}` },
});
if (!boot.ok) {
  console.warn("Bootstrap returned", boot.status, await boot.text());
} else {
  console.log("✓ Site bootstrapped");
}

const now = Math.floor(Date.now() / 1000);
execSync(
  `npx wrangler d1 execute samabrains-platform-d1 --remote --command "UPDATE tenants SET status='trialing', provisioned_at=${now} WHERE id='${tenant.id}'"`,
  { cwd: ROOT, env, stdio: "inherit" }
);
console.log("✓ Tenant status set to trialing");
console.log(`Live: ${siteUrl}`);
