/**
 * Verify Cloudflare Pages Git provisioning prerequisites.
 *   npm run provision:verify
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ACCOUNT_ID = "17ac8e645ffc2337eceac4d16704fc96";

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

const secrets = loadEnvFile(path.join(ROOT, "secrets.local.env"));
const token = secrets.CLOUDFLARE_API_TOKEN;

console.log("\n=== Signup provisioning flow (Git-based) ===\n");
console.log("On each signup the platform worker runs:\n");
const steps = [
  ["d1", "Create tenant D1 database"],
  ["r2", "Create R2 buckets (uploads + backups)"],
  ["vectorize", "Create Vectorize index (handbook search)"],
  [
    "pages",
    "Create Pages project linked to Samabrains/core-school-template on GitHub",
  ],
  [
    "secrets",
    "Apply D1/R2/Vectorize bindings + per-school env vars (JWT, admin email, colors, …)",
  ],
  ["migrate", "Run template SQL migrations on tenant D1"],
  [
    "deploy",
    "Trigger Cloudflare Git build from main (npm ci && npm run build && npm run pages:build)",
  ],
  ["bootstrap", "Seed welcome content via /api/admin/bootstrap"],
];
for (const [id, desc] of steps) {
  console.log(`  ${id.padEnd(10)} ${desc}`);
}

console.log("\nTemplate repo: Samabrains/core-school-template (branch: main)");
console.log(
  "GitHub org display name 'SamaBrains Solutions' = login Samabrains (not SamaBrains-Solutions)"
);
console.log("Cloudflare account:", ACCOUNT_ID);
console.log("Platform worker: https://school-platform.ssebasamatha.workers.dev\n");

if (!token) {
  console.error("✗ CLOUDFLARE_API_TOKEN missing in secrets.local.env");
  console.error("  Run: npm run setup:secrets && npm run deploy");
  process.exitCode = 1;
} else {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const probeDirect = `provision-direct-${Date.now()}`;
  console.log("--- Pages API (no Git) probe ---");
  const directRes = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ name: probeDirect, production_branch: "main" }),
    }
  );
  const directData = await directRes.json();
  if (directData.success) {
    console.log("✓ API token can create Pages projects (direct upload)");
    await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects/${probeDirect}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
    );
  } else {
    console.error("✗ Pages API failed even without Git");
    console.error("  HTTP", directRes.status, JSON.stringify(directData.errors));
    console.error("  Check CLOUDFLARE_API_TOKEN has Pages Edit on this account");
    process.exitCode = 1;
  }

  const probe = `provision-verify-${Date.now()}`;
  const body = {
    name: probe,
    production_branch: "main",
    build_config: {
      build_command: "npm ci && npm run build && npm run pages:build",
      destination_dir: ".vercel/output/static",
      root_dir: "",
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
        pr_comments_enabled: false,
      },
    },
  };

  console.log("\n--- Git Pages API probe ---");
  const createRes = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects`,
    { method: "POST", headers, body: JSON.stringify(body) }
  );
  const createData = await createRes.json();

  if (!createData.success) {
    const err = JSON.stringify(createData.errors);
    console.error("✗ Cannot create Git-connected Pages project");
    console.error("  HTTP", createRes.status, err);
    if (err.includes("8000011")) {
      console.error(
        "\n  GitHub app is installed, but Cloudflare account is not linked to it."
      );
      console.error("  Do BOTH:");
      console.error(
        "  1) GitHub → org Samabrains → Settings → Apps → Cloudflare Workers and Pages"
      );
      console.error("     → Configure → allow repo core-school-template (private OK)");
      console.error(
        "  2) Cloudflare dashboard (same account as school-platform):"
      );
      console.error(
        "     https://dash.cloudflare.com/" + ACCOUNT_ID + "/workers-and-pages"
      );
      console.error(
        "     → Create application → Pages → Connect to Git → authorize GitHub"
      );
      console.error(
        "     Pick Samabrains / core-school-template (cancel wizard after Git links)"
      );
    }
    process.exitCode = 1;
  } else {
    console.log("✓ Git-connected Pages project can be created");
    console.log(
      "  Repo:",
      createData.result?.source?.config?.repo_name ?? "core-school-template"
    );

    const delRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects/${probe}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
    );
    const delData = await delRes.json();
    if (delData.success) {
      console.log("✓ Probe project cleaned up");
    } else {
      console.warn("! Delete probe project manually:", probe);
    }

    console.log("\n=== Ready for signup ===");
    console.log("https://school-platform.ssebasamatha.workers.dev/signup\n");
  }
}
