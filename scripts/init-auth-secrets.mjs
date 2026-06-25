import { execSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ENV_FILE = path.join(ROOT, "secrets.local.env");
const EXAMPLE = path.join(ROOT, "secrets.local.env.example");

function putSecret(name, value) {
  execSync(`npx wrangler secret put ${name}`, {
    input: value,
    cwd: ROOT,
    stdio: ["pipe", "inherit", "inherit"],
  });
  console.log(`✓ Uploaded ${name}`);
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
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

function writeEnvFile(values) {
  let content = fs.existsSync(EXAMPLE)
    ? fs.readFileSync(EXAMPLE, "utf-8")
    : "";

  for (const [key, value] of Object.entries(values)) {
    const regex = new RegExp(`^${key}=.*$`, "m");
    const line = `${key}=${value}`;
    if (regex.test(content)) {
      content = content.replace(regex, line);
    } else {
      content += `\n${line}`;
    }
  }

  fs.writeFileSync(ENV_FILE, content.trim() + "\n");
}

const authSecrets = {
  PLATFORM_API_SECRET: crypto.randomBytes(32).toString("base64url"),
  PLATFORM_AUTH_SECRET: crypto.randomBytes(32).toString("base64url"),
};

console.log("=== Auth secrets (generated) ===\n");

for (const [name, value] of Object.entries(authSecrets)) {
  putSecret(name, value);
  console.log(`  ${name}=${value}\n`);
}

const existing = loadEnvFile(ENV_FILE);
writeEnvFile({ ...existing, ...authSecrets });

if (!fs.existsSync(ENV_FILE) && fs.existsSync(EXAMPLE)) {
  fs.copyFileSync(EXAMPLE, ENV_FILE);
  writeEnvFile({ ...loadEnvFile(ENV_FILE), ...authSecrets });
}

console.log(`Saved to ${ENV_FILE}`);
console.log("\nNext:");
console.log("  1. Fill PESAPAL_* and BREVO_API_KEY in secrets.local.env");
console.log("  2. node scripts/apply-secrets-from-env.mjs");
console.log("  3. node scripts/register-pesapal-ipn.mjs");
