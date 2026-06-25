import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const ENV_FILE = path.join(ROOT, "school-platform", "secrets.local.env");

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

function putPagesSecret(project, key, value) {
  execSync(`npx wrangler pages secret put ${key} --project-name ${project}`, {
    input: value,
    cwd: path.join(ROOT, "core-school-template"),
    stdio: ["pipe", "inherit", "inherit"],
    env: {
      ...process.env,
      CLOUDFLARE_ACCOUNT_ID: "17ac8e645ffc2337eceac4d16704fc96",
    },
  });
  console.log(`✓ ${key}`);
}

const env = loadEnvFile(ENV_FILE);
const project = "lincoln-academy";

const secrets = {
  PLATFORM_AUTH_SECRET: env.PLATFORM_AUTH_SECRET,
  PLATFORM_API_URL: "https://school-platform.ssebasamatha.workers.dev",
  PLATFORM_TENANT_ID: "ten_lincoln-academy",
  ADMIN_EMAIL: "principal@lincolnhigh.com",
  TENANT_BILLING_STATUS: "current",
};

for (const [key, value] of Object.entries(secrets)) {
  if (!value) {
    console.warn(`Skip ${key} (missing)`);
    continue;
  }
  putPagesSecret(project, key, value);
}

console.log("\nLincoln Pages secrets updated.");
