#!/usr/bin/env node
/**
 * Register Pesapal live IPN. Reads secrets.local.env (or env vars).
 * Writes PESAPAL_IPN_NOTIFICATION_ID back into secrets.local.env.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ENV_FILE = path.join(ROOT, "secrets.local.env");

const LIVE_BASE = "https://pay.pesapal.com/v3";

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

function patchEnvFile(key, value) {
  let content = fs.readFileSync(ENV_FILE, "utf-8");
  const regex = new RegExp(`^${key}=.*$`, "m");
  const line = `${key}=${value}`;
  content = regex.test(content)
    ? content.replace(regex, line)
    : content.trimEnd() + `\n${line}\n`;
  fs.writeFileSync(ENV_FILE, content);
}

const fileEnv = loadEnvFile(ENV_FILE);
const consumerKey =
  process.env.PESAPAL_CONSUMER_KEY ?? fileEnv.PESAPAL_CONSUMER_KEY;
const consumerSecret =
  process.env.PESAPAL_CONSUMER_SECRET ?? fileEnv.PESAPAL_CONSUMER_SECRET;
const ipnUrl =
  process.env.PESAPAL_IPN_URL ??
  fileEnv.PESAPAL_IPN_URL ??
  "https://school-platform.ssebasamatha.workers.dev/webhooks/pesapal/ipn";

async function getToken() {
  const res = await fetch(`${LIVE_BASE}/api/Auth/RequestToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      consumer_key: consumerKey,
      consumer_secret: consumerSecret,
    }),
  });
  const data = await res.json();
  if (!data.token) throw new Error(`Auth failed: ${JSON.stringify(data)}`);
  return data.token;
}

async function main() {
  if (!consumerKey || !consumerSecret) {
    console.error("Add PESAPAL_CONSUMER_KEY and PESAPAL_CONSUMER_SECRET to secrets.local.env");
    process.exit(1);
  }

  console.log(`Registering IPN: ${ipnUrl}`);

  const token = await getToken();
  const res = await fetch(`${LIVE_BASE}/api/URLSetup/RegisterIPN`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      url: ipnUrl,
      ipn_notification_type: "GET",
    }),
  });

  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));

  if (!res.ok) {
    process.exit(1);
  }

  const notificationId =
    data.ipn_id ??
    data.notification_id ??
    data.id ??
    data?.data?.ipn_id ??
    data?.ipn_notification_id;

  if (notificationId && fs.existsSync(ENV_FILE)) {
    patchEnvFile("PESAPAL_IPN_NOTIFICATION_ID", notificationId);
    console.log(`\n✓ Wrote PESAPAL_IPN_NOTIFICATION_ID to secrets.local.env`);
    console.log("  Run: npm run setup:secrets");
  } else if (notificationId) {
    console.log(`\nPESAPAL_IPN_NOTIFICATION_ID=${notificationId}`);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
