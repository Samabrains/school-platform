import type { Env, Tenant } from "../types";
import { getPlan, PLANS } from "../config/plans";

export async function getOpsMetrics(env: Env) {
  const { results: statusCounts } = await env.DB.prepare(
    `SELECT status, COUNT(*) as count FROM tenants GROUP BY status`
  ).all<{ status: string; count: number }>();

  const { results: billingCounts } = await env.DB.prepare(
    `SELECT billing_status, COUNT(*) as count FROM tenants GROUP BY billing_status`
  ).all<{ billing_status: string; count: number }>();

  const { results: activeTenants } = await env.DB.prepare(
    `SELECT plan FROM tenants WHERE status = 'active' AND billing_status = 'current'`
  ).all<{ plan: string }>();

  let mrrUgx = 0;
  for (const row of activeTenants ?? []) {
    const plan = getPlan(row.plan);
    if (plan) mrrUgx += plan.monthlyAmountUgx;
  }

  const { results: trialExpiring } = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM tenants
     WHERE status = 'trialing'
       AND trial_ends_at IS NOT NULL
       AND trial_ends_at < ?`
  )
    .bind(Math.floor(Date.now() / 1000) + 5 * 86400)
    .all<{ count: number }>();

  const byStatus = Object.fromEntries(
    (statusCounts ?? []).map((r) => [r.status, r.count])
  );
  const byBilling = Object.fromEntries(
    (billingCounts ?? []).map((r) => [r.billing_status, r.count])
  );

  return {
    tenants: {
      total: Object.values(byStatus).reduce((a, b) => a + b, 0),
      active: byStatus.active ?? 0,
      trialing: byStatus.trialing ?? 0,
      provisioning: byStatus.provisioning ?? 0,
      suspended: byStatus.suspended ?? 0,
      draft: byStatus.draft ?? 0,
    },
    billing: byBilling,
    mrr_ugx: mrrUgx,
    trial_expiring_5d: trialExpiring?.[0]?.count ?? 0,
    plans: PLANS,
  };
}

export async function listOpsTenants(
  env: Env,
  filters: { status?: string; q?: string }
) {
  let stmt = `SELECT id, slug, school_name, admin_email, status, plan, billing_status,
    trial_ends_at, production_url, template_version, created_at, provisioned_at, suspended_at,
    pesapal_order_tracking_id
    FROM tenants WHERE 1=1`;
  const bindings: (string | number)[] = [];

  if (filters.status) {
    stmt += " AND status = ?";
    bindings.push(filters.status);
  }

  if (filters.q) {
    const like = `%${filters.q.toLowerCase()}%`;
    stmt +=
      " AND (LOWER(slug) LIKE ? OR LOWER(school_name) LIKE ? OR LOWER(admin_email) LIKE ?)";
    bindings.push(like, like, like);
  }

  stmt += " ORDER BY created_at DESC LIMIT 200";

  const { results } = await env.DB.prepare(stmt)
    .bind(...bindings)
    .all<Tenant & { pesapal_order_tracking_id: string | null }>();

  const now = Math.floor(Date.now() / 1000);
  const tenants = (results ?? []).map((t) => ({
    ...t,
    trial_days_left: t.trial_ends_at
      ? Math.max(0, Math.ceil((t.trial_ends_at - now) / 86400))
      : null,
  }));

  return tenants;
}

export async function getOpsTenantDetail(env: Env, tenantId: string) {
  const tenant = await env.DB.prepare(
    "SELECT * FROM tenants WHERE id = ? OR slug = ? LIMIT 1"
  )
    .bind(tenantId, tenantId)
    .first<Tenant>();

  if (!tenant) return null;

  const { results: jobs } = await env.DB.prepare(
    "SELECT step, status, error, updated_at FROM provisioning_jobs WHERE tenant_id = ? ORDER BY updated_at"
  )
    .bind(tenant.id)
    .all<{ step: string; status: string; error: string | null; updated_at: number }>();

  const { results: billingEvents } = await env.DB.prepare(
    `SELECT id, pesapal_order_tracking_id, notification_type, payment_status, amount, currency, created_at
     FROM billing_events WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 20`
  )
    .bind(tenant.id)
    .all();

  const { results: deployments } = await env.DB.prepare(
    `SELECT d.id, d.git_sha, d.status, d.started_at, d.finished_at, td.status as tenant_status, td.error
     FROM tenant_deployments td
     JOIN deployments d ON d.id = td.deployment_id
     WHERE td.tenant_id = ?
     ORDER BY d.started_at DESC LIMIT 10`
  )
    .bind(tenant.id)
    .all();

  const now = Math.floor(Date.now() / 1000);

  return {
    tenant: {
      ...tenant,
      trial_days_left: tenant.trial_ends_at
        ? Math.max(0, Math.ceil((tenant.trial_ends_at - now) / 86400))
        : null,
    },
    provisioning_jobs: jobs ?? [],
    billing_events: billingEvents ?? [],
    deployments: deployments ?? [],
  };
}

export async function listRecentDeployments(env: Env, limit = 20) {
  const { results } = await env.DB.prepare(
    `SELECT d.id, d.git_sha, d.triggered_by, d.status, d.started_at, d.finished_at,
      (SELECT COUNT(*) FROM tenant_deployments td WHERE td.deployment_id = d.id AND td.status = 'completed') as completed,
      (SELECT COUNT(*) FROM tenant_deployments td WHERE td.deployment_id = d.id AND td.status = 'failed') as failed,
      (SELECT COUNT(*) FROM tenant_deployments td WHERE td.deployment_id = d.id) as total
     FROM deployments d
     ORDER BY d.started_at DESC
     LIMIT ?`
  )
    .bind(limit)
    .all();

  return results ?? [];
}
