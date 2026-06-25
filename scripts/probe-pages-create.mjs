/**
 * Diagnose Pages project creation (read-only probe name, cleans up on success).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ACCOUNT_ID = "17ac8e645ffc2337eceac4d16704fc96";
const PROBE = `probe-${Date.now()}`;

function loadEnvFile(filePath) {
  const out = {};
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

const secrets = loadEnvFile(path.join(ROOT, "secrets.local.env"));
const token = secrets.CLOUDFLARE_API_TOKEN;
if (!token) {
  console.error("Missing CLOUDFLARE_API_TOKEN in secrets.local.env");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};

const body = {
  name: PROBE,
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

async function api(method, pathSuffix, jsonBody) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}${pathSuffix}`,
    {
      method,
      headers,
      body: jsonBody ? JSON.stringify(jsonBody) : undefined,
    }
  );
  const data = await res.json();
  return { status: res.status, data };
}

console.log("Account:", ACCOUNT_ID);
console.log("Probe project name:", PROBE);
console.log("\n--- POST /pages/projects ---");
const create = await api("POST", "/pages/projects", body);
console.log("HTTP", create.status);
console.log(JSON.stringify(create.data, null, 2));

if (create.data.success) {
  console.log("\n--- DELETE probe project ---");
  const del = await api("DELETE", `/pages/projects/${PROBE}`);
  console.log(JSON.stringify(del.data, null, 2));
} else {
  console.log("\n--- GET /pages/projects/green-valley-academy (fallback path) ---");
  const get = await api("GET", "/pages/projects/green-valley-academy");
  console.log("HTTP", get.status);
  console.log(JSON.stringify(get.data, null, 2));
}
