/**
 * Fleet rollout: build once (in CI), deploy to all active tenants.
 *
 *   node scripts/rollout-tenants.mjs --git-sha=abc123 --artifact=.vercel/output/static
 *   node scripts/rollout-tenants.mjs --git-sha=abc123 --mode=git
 *   node scripts/rollout-tenants.mjs --git-sha=abc123 --canary=demo-school --dry-run
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ACCOUNT_ID = "17ac8e645ffc2337eceac4d16704fc96";
const DEFAULT_PLATFORM_URL =
  "https://school-platform.ssebasamatha.workers.dev";
const BATCH_SIZE = 10;

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : null;
}

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
const platformUrl =
  process.env.PLATFORM_PUBLIC_URL ??
  secrets.PLATFORM_PUBLIC_URL ??
  DEFAULT_PLATFORM_URL;
const apiSecret =
  process.env.PLATFORM_API_SECRET ?? secrets.PLATFORM_API_SECRET;
const cfToken =
  process.env.CLOUDFLARE_API_TOKEN ?? secrets.CLOUDFLARE_API_TOKEN;

const gitSha = arg("git-sha") ?? process.env.GITHUB_SHA ?? "";
const artifact = arg("artifact");
const mode = arg("mode") ?? (artifact ? "artifact" : "git");
const canary = arg("canary") ?? process.env.ROLLOUT_CANARY_SLUG ?? "demo-school";
const dryRun = process.argv.includes("--dry-run");
const batchSize = Number(arg("batch") ?? BATCH_SIZE);

if (!gitSha) {
  console.error("Usage: node scripts/rollout-tenants.mjs --git-sha=<sha> [--artifact=path] [--mode=git|artifact]");
  process.exit(1);
}

if (!apiSecret) {
  console.error("PLATFORM_API_SECRET required (secrets.local.env or env)");
  process.exit(1);
}

if (!cfToken) {
  console.error("CLOUDFLARE_API_TOKEN required");
  process.exit(1);
}

const authHeaders = {
  Authorization: `Bearer ${apiSecret}`,
  "Content-Type": "application/json",
};

async function api(pathname, init = {}) {
  const res = await fetch(`${platformUrl}${pathname}`, {
    ...init,
    headers: { ...authHeaders, ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${init.method ?? "GET"} ${pathname} → ${res.status}: ${text.slice(0, 300)}`);
  }
  return data;
}

function orderTenants(tenants, canarySlug) {
  const list = [...tenants];
  const idx = list.findIndex((t) => t.slug === canarySlug);
  if (idx > 0) {
    const [canaryTenant] = list.splice(idx, 1);
    list.unshift(canaryTenant);
  }
  return list;
}

async function deployArtifact(slug, artifactPath) {
  const resolved = path.resolve(artifactPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Artifact not found: ${resolved}`);
  }

  execSync(
    `npx wrangler pages deploy "${resolved}" --project-name=${slug} --branch=main`,
    {
      cwd: ROOT,
      env: {
        ...process.env,
        CLOUDFLARE_API_TOKEN: cfToken,
        CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID,
      },
      stdio: "inherit",
    }
  );
}

async function rolloutTenantGit(deploymentId, tenantId) {
  const result = await api(
    `/internal/deployments/${deploymentId}/tenants/${tenantId}/git-rollout`,
    { method: "POST", body: JSON.stringify({ max_wait_ms: 900_000 }) }
  );
  if (!result.ok) {
    throw new Error(result.error ?? "Git rollout failed");
  }
}

async function rolloutTenantArtifact(deploymentId, tenant, artifactPath) {
  await api(`/internal/tenants/${tenant.id}/prepare-rollout`, {
    method: "POST",
  });

  if (dryRun) {
    console.log(`  [dry-run] would deploy artifact to ${tenant.slug}`);
    return;
  }

  await deployArtifact(tenant.slug, artifactPath);

  const health = await api(`/internal/tenants/${tenant.id}/health`, {
    method: "POST",
  });
  if (!health.ok) {
    throw new Error(health.error ?? "Health check failed");
  }

  await api(
    `/internal/deployments/${deploymentId}/tenants/${tenant.id}/complete`,
    {
      method: "POST",
      body: JSON.stringify({
        status: "completed",
        git_sha: gitSha,
      }),
    }
  );
}

async function rolloutTenant(deploymentId, tenant, artifactPath) {
  console.log(`\n→ ${tenant.slug} (${tenant.school_name ?? tenant.id})`);

  await api(
    `/internal/deployments/${deploymentId}/tenants/${tenant.id}/complete`,
    {
      method: "POST",
      body: JSON.stringify({ status: "running" }),
    }
  ).catch(() => {});

  try {
    if (mode === "git") {
      if (dryRun) {
        console.log("  [dry-run] would git-rollout");
        return { ok: true };
      }
      await rolloutTenantGit(deploymentId, tenant.id);
    } else {
      await rolloutTenantArtifact(deploymentId, tenant, artifactPath);
    }
    console.log(`  ✓ ${tenant.slug}`);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`  ✗ ${tenant.slug}: ${message}`);
    if (!dryRun) {
      await api(
        `/internal/deployments/${deploymentId}/tenants/${tenant.id}/complete`,
        {
          method: "POST",
          body: JSON.stringify({ status: "failed", error: message }),
        }
      ).catch(() => {});
    }
    return { ok: false, error: message };
  }
}

async function runBatch(deploymentId, tenants, artifactPath) {
  const results = await Promise.all(
    tenants.map((tenant) => rolloutTenant(deploymentId, tenant, artifactPath))
  );
  return results;
}

async function main() {
  console.log(`Rollout ${gitSha.slice(0, 7)} mode=${mode} canary=${canary}`);

  if (mode === "artifact" && !artifact) {
    console.error("--artifact is required for artifact mode");
    process.exit(1);
  }

  const { tenants } = await api("/internal/tenants/active");
  if (!tenants?.length) {
    console.log("No active tenants to roll out.");
    return;
  }

  const ordered = orderTenants(tenants, canary);
  console.log(`Tenants (${ordered.length}): ${ordered.map((t) => t.slug).join(", ")}`);

  if (dryRun) {
    console.log("\n[dry-run] Skipping deployment record and uploads.");
    for (const tenant of ordered) {
      console.log(`  would roll out → ${tenant.slug}`);
    }
    return;
  }

  const { deployment } = await api("/internal/deployments", {
    method: "POST",
    body: JSON.stringify({ git_sha: gitSha, triggered_by: "ci" }),
  });

  const deploymentId = deployment.id;
  console.log(`Deployment ${deploymentId}`);

  let failed = false;

  // Canary first (sequential)
  const [first, ...rest] = ordered;
  const canaryResult = await rolloutTenant(deploymentId, first, artifact);
  if (!canaryResult.ok) {
    failed = true;
    console.error(`\nCanary ${first.slug} failed — stopping rollout.`);
    await api(`/internal/deployments/${deploymentId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "failed" }),
    });
    process.exit(1);
  }

  console.log(`\nCanary ${first.slug} OK — rolling out remaining tenants…`);

  for (let i = 0; i < rest.length; i += batchSize) {
    const batch = rest.slice(i, i + batchSize);
    const results = await runBatch(deploymentId, batch, artifact);
    if (results.some((r) => !r.ok)) {
      failed = true;
      console.error(`\nBatch failed — stopping further rollouts.`);
      break;
    }
  }

  await api(`/internal/deployments/${deploymentId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: failed ? "failed" : "completed" }),
  });

  const summary = await api(`/internal/deployments/${deploymentId}`);
  console.log("\n--- Rollout summary ---");
  for (const row of summary.tenant_results ?? []) {
    console.log(`  ${row.slug}: ${row.status}${row.error ? ` (${row.error})` : ""}`);
  }

  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
