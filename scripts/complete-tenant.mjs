/**
 * Finish tenant setup (fallback when auto-provision deploy/github steps fail).
 *
 *   npm run tenant:complete -- --slug=green-valley-academy
 *   npm run tenant:complete -- --slug=green-valley-academy --git
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TEMPLATE = path.resolve(ROOT, "..", "core-school-template");
const ACCOUNT_ID = "17ac8e645ffc2337eceac4d16704fc96";
const SECRETS_FILE = path.join(ROOT, "secrets.local.env");

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
    if (val) out[key] = val;
  }
  return out;
}

const localSecrets = loadEnvFile(SECRETS_FILE);

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : null;
}

const slug = arg("slug");
const useGit = process.argv.includes("--git");

if (!slug) {
  console.error(
    "Usage: node scripts/complete-tenant.mjs --slug=<name> [--git]"
  );
  process.exit(1);
}

const dbName = `${slug}-d1-production`;
const staticDir = path.join(TEMPLATE, ".vercel", "output", "static");
const env = {
  ...process.env,
  ...localSecrets,
  CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID,
};

function run(cmd, opts = {}) {
  console.log(`\n→ ${cmd}`);
  execSync(cmd, {
    stdio: "inherit",
    cwd: opts.cwd ?? TEMPLATE,
    env,
    ...opts,
  });
}

function getDatabaseId(name) {
  const out = execSync("npx wrangler d1 list --json", {
    cwd: TEMPLATE,
    env,
    encoding: "utf-8",
  });
  const match = JSON.parse(out).find((db) => db.name === name);
  if (!match?.uuid) throw new Error(`D1 database not found: ${name}`);
  return match.uuid;
}

function writeTenantWranglerConfig(slug, dbId) {
  const tenantsDir = path.join(TEMPLATE, "scripts", "tenants");
  fs.mkdirSync(tenantsDir, { recursive: true });
  const configPath = path.join(tenantsDir, `${slug}.wrangler.toml`);
  fs.writeFileSync(
    configPath,
    `# Auto-generated for tenant complete script
name = "${slug}"
compatibility_date = "2024-09-23"

[[d1_databases]]
binding = "DB"
database_name = "${dbName}"
database_id = "${dbId}"
migrations_dir = "../../drizzle"
`
  );
  return configPath;
}

async function ensureDirectUploadProject() {
  const token = env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error("CLOUDFLARE_API_TOKEN required");

  const getRes = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects/${slug}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const getData = await getRes.json();
  if (getData.success) {
    console.log("✓ Pages project exists");
    return;
  }

  const createRes = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: slug, production_branch: "main" }),
    }
  );
  const createData = await createRes.json();
  if (!createData.success) {
    throw new Error(
      `Create Pages project failed: ${JSON.stringify(createData.errors)}`
    );
  }
  console.log("✓ Created direct-upload Pages project");
}

async function directUploadDeploy() {
  if (!fs.existsSync(staticDir)) {
    console.log("No Pages build — running pages:build:win …");
    run("npm run pages:build:win", { cwd: TEMPLATE });
  }
  await ensureDirectUploadProject();
  run(
    `npx wrangler pages deploy .vercel/output/static --project-name ${slug} --commit-dirty=true`
  );
}

async function connectGitViaApi() {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    console.warn("Skip Git connect (set CLOUDFLARE_API_TOKEN)");
    return false;
  }
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: slug,
        production_branch: "main",
        build_config: {
          build_command: "npm ci && npm run build && npm run pages:build",
          destination_dir: ".vercel/output/static",
          build_caching: true,
        },
        source: {
          type: "github",
          config: {
            owner: "Samabrains",
            repo_name: "core-school-template",
            production_branch: "main",
            deployments_enabled: true,
            production_deployments_enabled: true,
            preview_deployment_setting: "none",
          },
        },
      }),
    }
  );
  const data = await res.json();
  if (!data.success) {
    console.warn("Git project create failed:", JSON.stringify(data.errors));
    return false;
  }
  console.log("✓ Created Pages project with GitHub source");
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
    console.warn("Git deploy trigger failed:", JSON.stringify(deployData.errors));
    return false;
  }
  console.log("✓ Triggered Cloudflare Git build — check Pages dashboard");
  return true;
}

async function main() {
  console.log(`\n=== Completing tenant: ${slug} ===\n`);

  const dbId = getDatabaseId(dbName);
  const wranglerConfig = writeTenantWranglerConfig(slug, dbId);

  console.log("[1/3] D1 migrations (remote)…");
  run(`npx wrangler d1 migrations apply DB --remote --config "${wranglerConfig}"`);

  if (useGit) {
    console.log("\n[2/3] Connect GitHub + trigger Cloudflare build…");
    const ok = await connectGitViaApi();
    if (!ok) {
      console.log("\nFalling back to direct upload…");
      await directUploadDeploy();
    }
  } else {
    console.log("\n[2/3] Direct upload deploy…");
    await directUploadDeploy();
  }

  const siteUrl = `https://${slug}.pages.dev`;
  console.log("\n[3/3] Update platform registry…");
  run(
    `npx wrangler d1 execute samabrains-platform-d1 --remote --command "UPDATE tenants SET production_url='${siteUrl}' WHERE slug='${slug}'"`,
    { cwd: ROOT }
  );

  console.log("\n=== Done ===");
  console.log(`Live URL: ${siteUrl}`);
  console.log(`Admin: ${siteUrl}/en/admin/login`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
