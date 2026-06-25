/**
 * Connect school-platform Worker to Samabrains/school-platform on GitHub (Workers Builds).
 *   node scripts/connect-worker-git.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ACCOUNT_ID = "17ac8e645ffc2337eceac4d16704fc96";
const WORKER_NAME = "school-platform";
const GITHUB_ORG = "Samabrains";
const GITHUB_ORG_ID = "233532341";
const GITHUB_REPO = "school-platform";
const GITHUB_REPO_ID = "1279817058";
const PRODUCTION_BRANCH = "master";

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
const token = process.env.CLOUDFLARE_API_TOKEN ?? secrets.CLOUDFLARE_API_TOKEN;

if (!token) {
  console.error("CLOUDFLARE_API_TOKEN required in secrets.local.env");
  process.exit(1);
}

async function cf(pathname, init = {}) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}${pathname}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    }
  );
  const data = await res.json();
  if (!data.success) {
    throw new Error(
      `${init.method ?? "GET"} ${pathname}: ${JSON.stringify(data.errors ?? data)}`
    );
  }
  return data.result;
}

async function main() {
  console.log("=== Connect school-platform Worker to GitHub ===\n");

  const scripts = await cf("/workers/scripts");
  const worker = scripts?.find?.((s) => s.id === WORKER_NAME) ?? scripts?.[WORKER_NAME];
  let workerTag;

  if (worker?.tag) {
    workerTag = worker.tag;
  } else if (Array.isArray(scripts)) {
    const hit = scripts.find((s) => s.id === WORKER_NAME);
    workerTag = hit?.tag;
  }

  if (!workerTag) {
    const list = await cf("/workers/scripts");
    const entries = Array.isArray(list)
      ? list
      : Object.entries(list ?? {}).map(([id, v]) => ({ id, ...v }));
    const hit = entries.find((s) => s.id === WORKER_NAME || s.name === WORKER_NAME);
    workerTag = hit?.tag;
    if (!workerTag) {
      console.error("Workers found:", entries.map((s) => s.id ?? s.name).join(", "));
      throw new Error(`Worker ${WORKER_NAME} not found`);
    }
  }

  console.log(`Worker tag: ${workerTag}`);

  let triggers = [];
  try {
    triggers = (await cf(`/builds/workers/${workerTag}/triggers`)) ?? [];
  } catch {
    triggers = [];
  }

  if (triggers.length > 0) {
    console.log("\nExisting build triggers:");
    for (const t of triggers) {
      console.log(
        `  - ${t.trigger_name} (${t.trigger_uuid}) branches: ${(t.branch_includes ?? []).join(", ")}`
      );
    }
    const prod = triggers.find((t) =>
      (t.branch_includes ?? []).includes(PRODUCTION_BRANCH)
    );
    if (prod) {
      console.log("\n✓ Git already connected. Triggering build…");
      const build = await cf(`/builds/triggers/${prod.trigger_uuid}/builds`, {
        method: "POST",
        body: JSON.stringify({ branch: PRODUCTION_BRANCH }),
      });
      console.log("Build started:", build?.build_uuid ?? build);
      return;
    }
  }

  console.log("\nCreating repository connection…");
  const connection = await cf("/builds/repos/connections", {
    method: "PUT",
    body: JSON.stringify({
      provider_type: "github",
      provider_account_id: String(GITHUB_ORG_ID),
      provider_account_name: GITHUB_ORG,
      repo_id: String(GITHUB_REPO_ID),
      repo_name: GITHUB_REPO,
    }),
  });

  const repoConnectionUuid = connection.repo_connection_uuid;
  console.log(`Repo connection: ${repoConnectionUuid}`);

  const tokens = await cf("/builds/tokens");
  const buildToken = tokens?.[0];
  if (!buildToken?.build_token_uuid) {
    throw new Error(
      "No build token found. In Cloudflare dashboard: school-platform → Settings → Builds → API token → Create"
    );
  }
  console.log(`Build token: ${buildToken.build_token_name ?? buildToken.build_token_uuid}`);

  console.log("\nCreating production trigger (branch: master)…");
  const trigger = await cf("/builds/triggers", {
    method: "POST",
    body: JSON.stringify({
      external_script_id: workerTag,
      repo_connection_uuid: repoConnectionUuid,
      build_token_uuid: buildToken.build_token_uuid,
      trigger_name: "Deploy production",
      build_command:
        "npm ci && git clone --depth 1 https://github.com/Samabrains/core-school-template.git ../core-school-template && TEMPLATE_ROOT=../core-school-template node scripts/bundle-tenant-migrations.mjs && npx wrangler d1 migrations apply samabrains-platform-d1 --remote",
      deploy_command: "npx wrangler deploy",
      root_directory: "/",
      branch_includes: [PRODUCTION_BRANCH],
      branch_excludes: [],
      path_includes: ["*"],
      path_excludes: [],
      build_caching_enabled: true,
    }),
  });

  console.log(`Trigger created: ${trigger.trigger_uuid}`);

  console.log("\nStarting first build…");
  const build = await cf(`/builds/triggers/${trigger.trigger_uuid}/builds`, {
    method: "POST",
    body: JSON.stringify({ branch: PRODUCTION_BRANCH }),
  });

  console.log("\n✓ Connected and build started");
  console.log(`  Build UUID: ${build?.build_uuid ?? JSON.stringify(build)}`);
  console.log(
    `  Dashboard: https://dash.cloudflare.com/${ACCOUNT_ID}/workers/services/view/${WORKER_NAME}/production/settings/builds`
  );
}

main().catch((err) => {
  console.error("\nFailed:", err.message);
  if (/Invalid token|Authentication/i.test(err.message)) {
    console.error(
      "\nWorkers Builds API needs a USER-scoped token with 'Workers Builds Configuration Edit'.\n" +
        "Create at: https://dash.cloudflare.com/profile/api-tokens\n" +
        "Or connect manually: Worker → Settings → Builds → Connect → GitHub → Samabrains/school-platform"
    );
  }
  if (/git|repository|provider/i.test(err.message)) {
    console.error(
      "\nInstall Cloudflare GitHub app for Samabrains/school-platform first:\n" +
        "https://github.com/apps/cloudflare-workers-and-pages/installations/new"
    );
  }
  process.exit(1);
});
