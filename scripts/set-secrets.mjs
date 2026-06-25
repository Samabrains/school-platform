/**
 * Set school-platform worker secrets from environment variables.
 *
 * Required for full operation:
 *   PESAPAL_CONSUMER_KEY, PESAPAL_CONSUMER_SECRET, PESAPAL_IPN_NOTIFICATION_ID
 *   BREVO_API_KEY, CLOUDFLARE_API_TOKEN
 *
 * Auto-generated if unset:
 *   PLATFORM_API_SECRET, PLATFORM_AUTH_SECRET
 *
 * Usage (PowerShell):
 *   $env:PESAPAL_CONSUMER_KEY="..."
 *   $env:BREVO_API_KEY="..."
 *   node scripts/set-secrets.mjs
 */
import { execSync } from "child_process";
import crypto from "crypto";

const secrets = [
  "PLATFORM_API_SECRET",
  "PLATFORM_AUTH_SECRET",
  "PESAPAL_CONSUMER_KEY",
  "PESAPAL_CONSUMER_SECRET",
  "PESAPAL_IPN_NOTIFICATION_ID",
  "BREVO_API_KEY",
  "CLOUDFLARE_API_TOKEN",
];

function putSecret(name, value) {
  execSync(`npx wrangler secret put ${name}`, {
    input: value,
    stdio: ["pipe", "inherit", "inherit"],
  });
  console.log(`✓ ${name}`);
}

const generated = {
  PLATFORM_API_SECRET: crypto.randomBytes(32).toString("base64url"),
  PLATFORM_AUTH_SECRET: crypto.randomBytes(32).toString("base64url"),
};

let set = 0;
let skipped = 0;

for (const name of secrets) {
  const value = process.env[name] ?? generated[name];
  if (!value) {
    console.warn(`⊘ ${name} (not set)`);
    skipped++;
    continue;
  }
  putSecret(name, value);
  set++;
}

console.log(`\nDone: ${set} set, ${skipped} skipped.`);

if (generated.PLATFORM_AUTH_SECRET && !process.env.PLATFORM_AUTH_SECRET) {
  console.log("\nSAVE for Lincoln Pages secret PLATFORM_AUTH_SECRET:");
  console.log(generated.PLATFORM_AUTH_SECRET);
}
