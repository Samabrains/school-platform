import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ENV_FILE = path.join(ROOT, "secrets.local.env");

const OPTIONAL_KEYS = [
  "PESAPAL_CONSUMER_KEY",
  "PESAPAL_CONSUMER_SECRET",
  "PESAPAL_IPN_NOTIFICATION_ID",
  "BREVO_API_KEY",
  "CLOUDFLARE_API_TOKEN",
];

function loadEnvFile(filePath) {
  const out = {};
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

function putSecret(name, value) {
  const env = { ...process.env };
  delete env.CLOUDFLARE_API_TOKEN;
  execSync(`npx wrangler secret put ${name}`, {
    input: value,
    cwd: ROOT,
    stdio: ["pipe", "inherit", "inherit"],
    env,
  });
  console.log(`✓ ${name}`);
}

if (!fs.existsSync(ENV_FILE)) {
  console.error(`Missing ${ENV_FILE}`);
  console.error("Copy secrets.local.env.example → secrets.local.env and fill values.");
  process.exit(1);
}

const env = loadEnvFile(ENV_FILE);
for (const key of Object.keys(env)) {
  if (key.startsWith("PESAPAL_") || key === "BREVO_API_KEY" || key === "CLOUDFLARE_API_TOKEN") {
    process.env[key] = env[key];
  }
}

let set = 0;
for (const name of OPTIONAL_KEYS) {
  const value = env[name];
  if (!value) {
    console.warn(`⊘ ${name} (empty in secrets.local.env)`);
    continue;
  }
  putSecret(name, value);
  set++;
}

console.log(`\nUploaded ${set} secret(s). Run: npx wrangler deploy`);
