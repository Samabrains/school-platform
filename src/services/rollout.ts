import type { Env, Tenant } from "../types";
import { applyTenantPagesConfig } from "./provision";
import { applyTenantD1Migrations, pagesDevUrl } from "./tenant-d1";
import {
  checkTenantHealth,
  triggerPagesGitDeploy,
  waitForPagesDeployment,
} from "./pages-git";

export type DeploymentStatus = "running" | "completed" | "failed";
export type TenantDeploymentStatus = "pending" | "running" | "completed" | "failed";

export async function createDeployment(
  env: Env,
  gitSha: string,
  triggeredBy: string
) {
  const id = `dep_${crypto.randomUUID()}`;
  const now = Math.floor(Date.now() / 1000);

  await env.DB.prepare(
    `INSERT INTO deployments (id, git_sha, triggered_by, status, started_at)
     VALUES (?, ?, ?, 'running', ?)`
  )
    .bind(id, gitSha, triggeredBy, now)
    .run();

  return { id, git_sha: gitSha, status: "running" as const, started_at: now };
}

export async function finishDeployment(
  env: Env,
  deploymentId: string,
  status: DeploymentStatus
) {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "UPDATE deployments SET status = ?, finished_at = ? WHERE id = ?"
  )
    .bind(status, now, deploymentId)
    .run();
}

export async function recordTenantDeployment(
  env: Env,
  deploymentId: string,
  tenantId: string,
  result: {
    status: TenantDeploymentStatus;
    pagesDeploymentId?: string | null;
    error?: string | null;
    gitSha?: string | null;
  }
) {
  await env.DB.prepare(
    `INSERT INTO tenant_deployments (deployment_id, tenant_id, status, pages_deployment_id, error)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(deployment_id, tenant_id) DO UPDATE SET
       status = excluded.status,
       pages_deployment_id = excluded.pages_deployment_id,
       error = excluded.error`
  )
    .bind(
      deploymentId,
      tenantId,
      result.status,
      result.pagesDeploymentId ?? null,
      result.error ?? null
    )
    .run();

  if (result.status === "completed" && result.gitSha) {
    await env.DB.prepare(
      "UPDATE tenants SET template_version = ? WHERE id = ?"
    )
      .bind(result.gitSha, tenantId)
      .run();
  }
}

export async function getActiveTenantsForRollout(env: Env) {
  const { results } = await env.DB.prepare(
    `SELECT id, slug, school_name, pages_project_name, d1_database_id, production_url, status, template_version
     FROM tenants
     WHERE status IN ('trialing', 'active')
       AND d1_database_id IS NOT NULL
       AND d1_database_id != ''
     ORDER BY slug`
  ).all<Tenant>();

  return results ?? [];
}

/** Migrations + Pages bindings before a CI artifact upload or git redeploy. */
export async function prepareTenantRollout(env: Env, tenantId: string) {
  const tenant = await env.DB.prepare(
    "SELECT * FROM tenants WHERE id = ? OR slug = ? LIMIT 1"
  )
    .bind(tenantId, tenantId)
    .first<Tenant>();

  if (!tenant?.d1_database_id) {
    throw new Error(`Tenant ${tenantId} not found or missing D1`);
  }

  await applyTenantD1Migrations(env, tenant.d1_database_id);
  await applyTenantPagesConfig(env, tenant.id);

  const productionUrl = pagesDevUrl(tenant.slug);
  if (tenant.production_url !== productionUrl) {
    await env.DB.prepare(
      "UPDATE tenants SET production_url = ? WHERE id = ?"
    )
      .bind(productionUrl, tenant.id)
      .run();
  }

  return { tenant: { ...tenant, production_url: productionUrl } };
}

/** Git redeploy path (no pre-built artifact). Used by manual rollout. */
export async function rolloutTenantViaGit(
  env: Env,
  deploymentId: string,
  tenantId: string,
  gitSha: string,
  maxDeployWaitMs = 600_000
) {
  await recordTenantDeployment(env, deploymentId, tenantId, {
    status: "running",
  });

  try {
    const { tenant } = await prepareTenantRollout(env, tenantId);
    const slug = tenant.pages_project_name || tenant.slug;

    const deployment = await triggerPagesGitDeploy(env, slug);
    await waitForPagesDeployment(env, slug, deployment.id, maxDeployWaitMs);
    await applyTenantPagesConfig(env, tenant.id);
    await checkTenantHealth(tenant.production_url);

    await recordTenantDeployment(env, deploymentId, tenantId, {
      status: "completed",
      pagesDeploymentId: deployment.id,
      gitSha,
    });

    return { ok: true as const, pagesDeploymentId: deployment.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordTenantDeployment(env, deploymentId, tenantId, {
      status: "failed",
      error: message,
    });
    return { ok: false as const, error: message };
  }
}

export async function getDeployment(env: Env, deploymentId: string) {
  const deployment = await env.DB.prepare(
    "SELECT * FROM deployments WHERE id = ?"
  )
    .bind(deploymentId)
    .first<{
      id: string;
      git_sha: string;
      triggered_by: string;
      status: string;
      started_at: number;
      finished_at: number | null;
    }>();

  if (!deployment) return null;

  const { results } = await env.DB.prepare(
    `SELECT td.tenant_id, td.status, td.pages_deployment_id, td.error, t.slug, t.school_name
     FROM tenant_deployments td
     JOIN tenants t ON t.id = td.tenant_id
     WHERE td.deployment_id = ?
     ORDER BY t.slug`
  )
    .bind(deploymentId)
    .all();

  return { deployment, tenant_results: results ?? [] };
}
