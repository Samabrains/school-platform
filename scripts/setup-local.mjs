/**
 * Full local setup (no GitHub Actions):
 *   1. init-auth-secrets.mjs  — generate + upload auth secrets
 *   2. You fill secrets.local.env (Pesapal, Brevo, CF token)
 *   3. apply-secrets-from-env.mjs
 *   4. register-pesapal-ipn.mjs → add PESAPAL_IPN_NOTIFICATION_ID to file → apply again
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function run(cmd) {
  execSync(cmd, { cwd: ROOT, stdio: "inherit" });
}

console.log("Step 1/4 — Auth secrets\n");
run("node scripts/init-auth-secrets.mjs");

const envFile = path.join(ROOT, "secrets.local.env");
const env = fs.readFileSync(envFile, "utf-8");
const hasPesapal =
  /PESAPAL_CONSUMER_KEY=\S/.test(env) && /PESAPAL_CONSUMER_SECRET=\S/.test(env);
const hasBrevo = /BREVO_API_KEY=\S/.test(env);

if (hasPesapal || hasBrevo) {
  console.log("\nStep 2/4 — Pesapal + Brevo + CF token\n");
  run("node scripts/apply-secrets-from-env.mjs");
} else {
  console.log("\nStep 2/4 — Skipped (fill secrets.local.env first)\n");
}

if (hasPesapal) {
  console.log("\nStep 3/4 — Register Pesapal IPN\n");
  try {
    run("node scripts/register-pesapal-ipn.mjs");
    console.log(
      "\nAdd PESAPAL_IPN_NOTIFICATION_ID to secrets.local.env, then run:"
    );
    console.log("  node scripts/apply-secrets-from-env.mjs");
  } catch {
    console.warn("IPN registration failed — check Pesapal keys in secrets.local.env");
  }
} else {
  console.log("\nStep 3/4 — Skipped (add Pesapal keys to secrets.local.env)\n");
}

console.log("\nStep 4/4 — Deploy worker\n");
run("npx wrangler deploy");
