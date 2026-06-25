import { Hono } from "hono";
import { requirePlatformAuth } from "./auth";
import type { Env, Tenant } from "./types";
import { createSignupTenant, checkSlugAvailable, enqueueProvisioning, getSetupStatus, retryProvisioning } from "./services/signup";
import { getPlan, formatUgx, PLANS } from "./config/plans";
import {
  submitSubscriptionOrder,
  getTransactionStatus,
  isPaymentCompleted,
} from "./services/pesapal";
import { runTrialCron } from "./services/trial-cron";
import { signupPageHtml, subscribePageHtml, setupPageHtml, pricingPageHtml, homePageHtml, termsPageHtml, privacyPageHtml } from "./views/pages";
import { opsDashboardHtml } from "./views/ops";
import {
  getOpsMetrics,
  getOpsTenantDetail,
  listOpsTenants,
  listRecentDeployments,
} from "./services/ops";
import {
  createDeployment,
  finishDeployment,
  getActiveTenantsForRollout,
  getDeployment,
  prepareTenantRollout,
  recordTenantDeployment,
  rolloutTenantViaGit,
} from "./services/rollout";
import { checkTenantHealth } from "./services/pages-git";
import { deleteTenantCompletely } from "./services/delete-tenant";
import { logOpsAction, listOpsAuditLog } from "./services/audit";
import { healthSweepAllTenants } from "./services/health-sweep";
import { redeployTenant } from "./services/redeploy";
import { tenantPublicUrl } from "./services/tenant-url";

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) =>
  c.json({
    status: "ok",
    service: "school-platform",
    billing_currency: c.env.BILLING_CURRENCY ?? "UGX",
    timestamp: new Date().toISOString(),
  })
);

app.get("/", (c) => c.html(homePageHtml(c.env)));

app.get("/terms", (c) => c.html(termsPageHtml(c.env)));

app.get("/privacy", (c) => c.html(privacyPageHtml(c.env)));

app.get("/signup", (c) => c.html(signupPageHtml(c.env)));

app.get("/pricing", (c) => c.html(pricingPageHtml(c.env)));

app.get("/setup/:tenantId", async (c) => {
  const status = await getSetupStatus(c.env, c.req.param("tenantId"));
  if (!status) return c.text("Not found", 404);
  return c.html(setupPageHtml(status.tenant, status.jobs, c.env));
});

app.get("/subscribe", (c) => c.html(subscribePageHtml(c.env)));

app.get("/ops", (c) => c.html(opsDashboardHtml(c.env)));

app.get("/api/plans", (c) =>
  c.json({
    currency: "UGX",
    plans: Object.values(PLANS).map((p) => ({
      ...p,
      formatted: formatUgx(p.monthlyAmountUgx),
    })),
  })
);

app.get("/api/signup/check-slug", async (c) => {
  const slug = c.req.query("slug") ?? "";
  const result = await checkSlugAvailable(c.env, slug);
  return c.json(result);
});

app.post("/api/signup", async (c) => {
  const body = await c.req.json<{
    school_name: string;
    slug?: string;
    admin_email: string;
    admin_phone?: string;
    plan?: string;
    tagline?: string;
    primary_color?: string;
    secondary_color?: string;
    accept_terms?: boolean;
  }>();

  const clientIp =
    c.req.header("CF-Connecting-IP") ??
    c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "unknown";

  const result = await createSignupTenant(c.env, body, clientIp);
  if ("error" in result && result.error) {
    return c.json({ error: result.error }, result.status);
  }

  enqueueProvisioning(c.executionCtx, c.env, result.tenantId!);

  return c.json(
    {
      tenant_id: result.tenantId,
      slug: result.tenant!.slug,
      setup_url: `${c.env.PLATFORM_PUBLIC_URL ?? ""}/setup/${result.tenantId}`,
      status: "provisioning",
    },
    201
  );
});

app.get("/api/setup/:tenantId", async (c) => {
  const status = await getSetupStatus(c.env, c.req.param("tenantId"));
  if (!status) return c.json({ error: "Not found" }, 404);
  return c.json(status);
});

app.post("/api/setup/:tenantId/retry", async (c) => {
  const tenantId = c.req.param("tenantId");
  const result = await retryProvisioning(c.executionCtx, c.env, tenantId);
  if ("error" in result && result.error) {
    return c.json({ error: result.error }, result.status);
  }
  return c.json({ ok: true });
});

app.get("/api/public/billing/:tenantId", async (c) => {
  const tenant = await c.env.DB.prepare(
    "SELECT id, slug, status, billing_status, trial_ends_at, plan FROM tenants WHERE id = ? OR slug = ?"
  )
    .bind(c.req.param("tenantId"), c.req.param("tenantId"))
    .first<Tenant>();

  if (!tenant) return c.json({ error: "Not found" }, 404);

  const now = Math.floor(Date.now() / 1000);
  const daysLeft = tenant.trial_ends_at
    ? Math.max(0, Math.ceil((tenant.trial_ends_at - now) / 86400))
    : 0;

  const plan = getPlan(tenant.plan);

  return c.json({
    status: tenant.status,
    billing_status: tenant.billing_status,
    trial_ends_at: tenant.trial_ends_at,
    days_left: daysLeft,
    plan: tenant.plan,
    monthly_amount_ugx: plan?.monthlyAmountUgx ?? null,
    subscribe_url: `${c.env.PLATFORM_PUBLIC_URL ?? ""}/subscribe?tenant=${tenant.id}`,
  });
});

app.post("/api/billing/subscribe", async (c) => {
  const { tenant_id } = await c.req.json<{ tenant_id: string }>();
  if (!tenant_id) return c.json({ error: "tenant_id required" }, 400);

  const tenant = await c.env.DB.prepare("SELECT * FROM tenants WHERE id = ?")
    .bind(tenant_id)
    .first<Tenant>();

  if (!tenant) return c.json({ error: "Tenant not found" }, 404);

  const plan = getPlan(tenant.plan);
  if (!plan) return c.json({ error: "Invalid plan" }, 400);

  const now = Math.floor(Date.now() / 1000);
  const billingStart =
    tenant.trial_ends_at && tenant.trial_ends_at > now
      ? tenant.trial_ends_at
      : now;

  const callbackUrl = `${c.env.PLATFORM_PUBLIC_URL ?? ""}/billing/pesapal/callback?tenant=${tenant.id}`;

  const order = await submitSubscriptionOrder(c.env, {
    tenantId: tenant.id,
    accountNumber: tenant.pesapal_account_number ?? `ten_${tenant.slug}`,
    amountUgx: plan.monthlyAmountUgx,
    description: `SamaBrains School WaaS — ${plan.name} (monthly)`,
    adminEmail: tenant.admin_email,
    adminPhone: tenant.admin_phone ?? undefined,
    billingStartUnix: billingStart,
    callbackUrl,
  });

  if (order.order_tracking_id) {
    await c.env.DB.prepare(
      "UPDATE tenants SET pesapal_order_tracking_id = ? WHERE id = ?"
    )
      .bind(order.order_tracking_id, tenant.id)
      .run();
  }

  return c.json({ redirect_url: order.redirect_url });
});

app.get("/billing/pesapal/callback", async (c) => {
  const tenantId = c.req.query("tenant");
  const orderTrackingId =
    c.req.query("OrderTrackingId") ?? c.req.query("orderTrackingId");

  if (!tenantId) return c.text("Missing tenant", 400);

  const tenant = await c.env.DB.prepare("SELECT * FROM tenants WHERE id = ?")
    .bind(tenantId)
    .first<Tenant>();

  if (!tenant) return c.text("Tenant not found", 404);

  const trackingId = orderTrackingId ?? tenant.pesapal_order_tracking_id;
  if (trackingId) {
    try {
      const status = await getTransactionStatus(c.env, trackingId);
      if (isPaymentCompleted(status)) {
        await c.env.DB.prepare(
          "UPDATE tenants SET status = ?, billing_status = ?, suspended_at = NULL WHERE id = ?"
        )
          .bind("active", "current", tenant.id)
          .run();
      }
    } catch (e) {
      console.error("Callback status check failed:", e);
    }
  }

  return c.redirect(
    `${tenant.production_url}/en/admin?billing=success`
  );
});

app.post("/webhooks/pesapal/ipn", async (c) => {
  const body = await c.req.json<{
    OrderNotificationType?: string;
    OrderTrackingId?: string;
    OrderMerchantReference?: string;
  }>();

  const orderTrackingId = body.OrderTrackingId;
  if (!orderTrackingId) {
    return c.json({ error: "Missing OrderTrackingId" }, 400);
  }

  const status = await getTransactionStatus(c.env, orderTrackingId);
  const tenant = await c.env.DB.prepare(
    "SELECT * FROM tenants WHERE pesapal_order_tracking_id = ? OR id = ?"
  )
    .bind(orderTrackingId, body.OrderMerchantReference?.split("-")[1] ?? "")
    .first<Tenant>();

  if (!tenant) {
    return c.json({ received: true, matched: false });
  }

  const now = Math.floor(Date.now() / 1000);
  await c.env.DB.prepare(
    `INSERT INTO billing_events (id, tenant_id, pesapal_order_tracking_id, notification_type, payment_status, amount, currency, raw_payload, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      crypto.randomUUID(),
      tenant.id,
      orderTrackingId,
      body.OrderNotificationType ?? "IPNCHANGE",
      status.payment_status_description ?? "unknown",
      String(status.amount ?? ""),
      status.currency ?? "UGX",
      JSON.stringify({ body, status }),
      now
    )
    .run();

  if (isPaymentCompleted(status)) {
    await c.env.DB.prepare(
      "UPDATE tenants SET status = ?, billing_status = ?, suspended_at = NULL WHERE id = ?"
    )
      .bind("active", "current", tenant.id)
      .run();
  } else if (
    body.OrderNotificationType === "RECURRING" &&
    !isPaymentCompleted(status)
  ) {
    await c.env.DB.prepare(
      "UPDATE tenants SET status = ?, billing_status = ?, suspended_at = ? WHERE id = ?"
    )
      .bind("suspended", "past_due", now, tenant.id)
      .run();
  }

  return c.json({ received: true });
});

// --- Authenticated ops routes (Phase A) ---

app.get("/api/tenants", async (c) => {
  const denied = requirePlatformAuth(c);
  if (denied) return denied;

  const status = c.req.query("status");
  let stmt = "SELECT * FROM tenants ORDER BY created_at DESC";
  const bindings: string[] = [];

  if (status) {
    stmt = "SELECT * FROM tenants WHERE status = ? ORDER BY created_at DESC";
    bindings.push(status);
  }

  const { results } = await c.env.DB.prepare(stmt)
    .bind(...bindings)
    .all<Tenant>();

  return c.json({ tenants: results ?? [] });
});

app.get("/api/tenants/:id", async (c) => {
  const denied = requirePlatformAuth(c);
  if (denied) return denied;

  const id = c.req.param("id");
  const tenant = await c.env.DB.prepare(
    "SELECT * FROM tenants WHERE id = ? OR slug = ? LIMIT 1"
  )
    .bind(id, id)
    .first<Tenant>();

  if (!tenant) return c.json({ error: "Tenant not found" }, { status: 404 });
  return c.json({ tenant });
});

app.post("/api/tenants", async (c) => {
  const denied = requirePlatformAuth(c);
  if (denied) return denied;

  const body = await c.req.json<Partial<Tenant>>();
  const now = Math.floor(Date.now() / 1000);

  const tenant: Tenant = {
    id: body.id ?? `ten_${crypto.randomUUID()}`,
    slug: body.slug ?? "",
    school_name: body.school_name ?? "",
    admin_email: body.admin_email ?? "",
    status: (body.status as Tenant["status"]) ?? "trialing",
    plan: body.plan ?? "starter",
    billing_status: (body.billing_status as Tenant["billing_status"]) ?? "trial",
    trial_ends_at: body.trial_ends_at ?? now + 30 * 86400,
    pesapal_account_number: body.pesapal_account_number ?? `ten_${body.slug}`,
    pesapal_order_tracking_id: null,
    template_version: body.template_version ?? null,
    pages_project_name: body.pages_project_name ?? body.slug ?? "",
    production_url:
      body.production_url ??
      (body.slug ? tenantPublicUrl(c.env, body.slug) : ""),
    d1_database_id: body.d1_database_id ?? "",
    r2_bucket: body.r2_bucket ?? null,
    vectorize_index: body.vectorize_index ?? null,
    custom_domain: null,
    created_at: body.created_at ?? now,
    provisioned_at: body.provisioned_at ?? now,
    suspended_at: null,
  };

  if (!tenant.slug || !tenant.school_name || !tenant.admin_email || !tenant.d1_database_id) {
    return c.json(
      { error: "slug, school_name, admin_email, and d1_database_id are required" },
      { status: 400 }
    );
  }

  try {
    await c.env.DB.prepare(
      `INSERT INTO tenants (
        id, slug, school_name, admin_email, status, plan, billing_status,
        trial_ends_at, pesapal_account_number, pages_project_name, production_url,
        d1_database_id, r2_bucket, vectorize_index, created_at, provisioned_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        tenant.id,
        tenant.slug,
        tenant.school_name,
        tenant.admin_email,
        tenant.status,
        tenant.plan,
        tenant.billing_status,
        tenant.trial_ends_at,
        tenant.pesapal_account_number,
        tenant.pages_project_name,
        tenant.production_url,
        tenant.d1_database_id,
        tenant.r2_bucket,
        tenant.vectorize_index,
        tenant.created_at,
        tenant.provisioned_at
      )
      .run();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Insert failed";
    if (message.includes("UNIQUE")) {
      return c.json({ error: "Tenant slug already exists" }, { status: 409 });
    }
    return c.json({ error: message }, { status: 500 });
  }

  return c.json({ tenant }, { status: 201 });
});

app.patch("/api/tenants/:id/status", async (c) => {
  const denied = requirePlatformAuth(c);
  if (denied) return denied;

  const id = c.req.param("id");
  const { status } = await c.req.json<{ status: string }>();
  if (!status) return c.json({ error: "status is required" }, { status: 400 });

  const tenant = await c.env.DB.prepare(
    "SELECT id, slug FROM tenants WHERE id = ? OR slug = ? LIMIT 1"
  )
    .bind(id, id)
    .first<{ id: string; slug: string }>();

  if (!tenant) return c.json({ error: "Tenant not found" }, { status: 404 });

  await c.env.DB.prepare(
    "UPDATE tenants SET status = ?, suspended_at = CASE WHEN ? = 'suspended' THEN ? ELSE suspended_at END WHERE id = ?"
  )
    .bind(status, status, Math.floor(Date.now() / 1000), tenant.id)
    .run();

  await logOpsAction(c.env, {
    action: `tenant.${status}`,
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
  });

  return c.json({ success: true, status });
});

// --- Ops dashboard API (Phase E) ---

app.get("/api/ops/metrics", async (c) => {
  const denied = requirePlatformAuth(c);
  if (denied) return denied;
  return c.json(await getOpsMetrics(c.env));
});

app.get("/api/ops/tenants", async (c) => {
  const denied = requirePlatformAuth(c);
  if (denied) return denied;

  const tenants = await listOpsTenants(c.env, {
    status: c.req.query("status"),
    q: c.req.query("q"),
  });
  return c.json({ tenants });
});

app.get("/api/ops/tenants/:id", async (c) => {
  const denied = requirePlatformAuth(c);
  if (denied) return denied;

  const detail = await getOpsTenantDetail(c.env, c.req.param("id"));
  if (!detail) return c.json({ error: "Tenant not found" }, 404);
  return c.json(detail);
});

app.get("/api/ops/deployments", async (c) => {
  const denied = requirePlatformAuth(c);
  if (denied) return denied;
  const deployments = await listRecentDeployments(c.env);
  return c.json({ deployments });
});

app.post("/api/ops/tenants/:id/retry", async (c) => {
  const denied = requirePlatformAuth(c);
  if (denied) return denied;

  const id = c.req.param("id");
  const result = await retryProvisioning(
    c.executionCtx,
    c.env,
    id
  );
  if ("error" in result && result.error) {
    return c.json({ error: result.error }, result.status);
  }

  const tenant = await c.env.DB.prepare(
    "SELECT id, slug FROM tenants WHERE id = ? OR slug = ? LIMIT 1"
  )
    .bind(id, id)
    .first<{ id: string; slug: string }>();

  if (tenant) {
    await logOpsAction(c.env, {
      action: "tenant.retry_provisioning",
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
    });
  }

  return c.json({ ok: true });
});

app.post("/api/ops/tenants/:id/redeploy", async (c) => {
  const denied = requirePlatformAuth(c);
  if (denied) return denied;

  const id = c.req.param("id");
  try {
    const result = await redeployTenant(c.env, id);
    const tenant = await c.env.DB.prepare(
      "SELECT id, slug FROM tenants WHERE id = ? OR slug = ? LIMIT 1"
    )
      .bind(id, id)
      .first<{ id: string; slug: string }>();

    if (tenant) {
      await logOpsAction(c.env, {
        action: result.ok ? "tenant.redeploy" : "tenant.redeploy_failed",
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        detail: result.error ?? result.pages_deployment_id ?? null,
      });
    }

    if (!result.ok) {
      return c.json({ error: result.error, deployment_id: result.deployment_id }, 500);
    }
    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: message }, 500);
  }
});

app.post("/api/ops/health-sweep", async (c) => {
  const denied = requirePlatformAuth(c);
  if (denied) return denied;

  const sweep = await healthSweepAllTenants(c.env);
  await logOpsAction(c.env, {
    action: "health_sweep",
    detail: `${sweep.healthy}/${sweep.total} healthy`,
  });
  return c.json(sweep);
});

app.get("/api/ops/audit-log", async (c) => {
  const denied = requirePlatformAuth(c);
  if (denied) return denied;

  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const entries = await listOpsAuditLog(c.env, limit);
  return c.json({ entries });
});

app.post("/api/ops/tenants/:id/bindings", async (c) => {
  const denied = requirePlatformAuth(c);
  if (denied) return denied;

  try {
    await prepareTenantRollout(c.env, c.req.param("id"));
    const tenant = await c.env.DB.prepare(
      "SELECT id, slug FROM tenants WHERE id = ? OR slug = ? LIMIT 1"
    )
      .bind(c.req.param("id"), c.req.param("id"))
      .first<{ id: string; slug: string }>();
    if (tenant) {
      await logOpsAction(c.env, {
        action: "tenant.bindings",
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
      });
    }
    return c.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: message }, 500);
  }
});

app.post("/api/ops/tenants/:id/health", async (c) => {
  const denied = requirePlatformAuth(c);
  if (denied) return denied;

  const tenant = await c.env.DB.prepare(
    "SELECT production_url, slug FROM tenants WHERE id = ? OR slug = ? LIMIT 1"
  )
    .bind(c.req.param("id"), c.req.param("id"))
    .first<{ production_url: string; slug: string }>();

  if (!tenant) return c.json({ error: "Tenant not found" }, 404);

  try {
    await checkTenantHealth(tenant.production_url);
    await logOpsAction(c.env, {
      action: "tenant.health_ok",
      tenantSlug: tenant.slug,
    });
    return c.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logOpsAction(c.env, {
      action: "tenant.health_fail",
      tenantSlug: tenant.slug,
      detail: message,
    });
    return c.json({ ok: false, error: message }, 503);
  }
});

app.get("/api/ops/tenants/:id/pesapal", async (c) => {
  const denied = requirePlatformAuth(c);
  if (denied) return denied;

  const tenant = await c.env.DB.prepare(
    "SELECT pesapal_order_tracking_id FROM tenants WHERE id = ? OR slug = ? LIMIT 1"
  )
    .bind(c.req.param("id"), c.req.param("id"))
    .first<{ pesapal_order_tracking_id: string | null }>();

  if (!tenant) return c.json({ error: "Tenant not found" }, 404);

  const trackingId = tenant.pesapal_order_tracking_id;
  if (!trackingId) {
    return c.json({ error: "No Pesapal order tracking ID on file" }, 404);
  }

  try {
    const status = await getTransactionStatus(c.env, trackingId);
    return c.json({ order_tracking_id: trackingId, status });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: message }, 502);
  }
});

app.delete("/api/ops/tenants/:id", async (c) => {
  const denied = requirePlatformAuth(c);
  if (denied) return denied;

  const body = await c.req
    .json<{ confirm_slug?: string }>()
    .catch(() => ({} as { confirm_slug?: string }));

  if (!body.confirm_slug) {
    return c.json(
      { error: "confirm_slug is required — must match tenant slug exactly" },
      400
    );
  }

  try {
    const result = await deleteTenantCompletely(c.env, c.req.param("id"), {
      confirmSlug: body.confirm_slug,
    });
    await logOpsAction(c.env, {
      action: "tenant.delete",
      tenantId: result.tenant.id,
      tenantSlug: result.tenant.slug,
    });
    const failed = result.steps.filter((s) => !s.ok);
    return c.json({
      ok: failed.length === 0,
      deleted: result.tenant,
      steps: result.steps,
      warnings: failed.length
        ? failed.map((s) => `${s.step}: ${s.detail ?? "failed"}`)
        : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: message }, 400);
  }
});

app.get("/internal/tenants/active", async (c) => {
  const denied = requirePlatformAuth(c);
  if (denied) return denied;

  const tenants = await getActiveTenantsForRollout(c.env);
  return c.json({ tenants });
});

app.post("/internal/deployments", async (c) => {
  const denied = requirePlatformAuth(c);
  if (denied) return denied;

  const body = await c.req.json<{
    git_sha: string;
    triggered_by?: string;
  }>();

  if (!body.git_sha) {
    return c.json({ error: "git_sha is required" }, 400);
  }

  const deployment = await createDeployment(
    c.env,
    body.git_sha,
    body.triggered_by ?? "ci"
  );

  return c.json({ deployment }, 201);
});

app.get("/internal/deployments/:id", async (c) => {
  const denied = requirePlatformAuth(c);
  if (denied) return denied;

  const result = await getDeployment(c.env, c.req.param("id"));
  if (!result) return c.json({ error: "Not found" }, 404);
  return c.json(result);
});

app.patch("/internal/deployments/:id", async (c) => {
  const denied = requirePlatformAuth(c);
  if (denied) return denied;

  const body = await c.req.json<{ status: "completed" | "failed" }>();
  if (!body.status) {
    return c.json({ error: "status is required" }, 400);
  }

  await finishDeployment(c.env, c.req.param("id"), body.status);
  return c.json({ ok: true });
});

app.post("/internal/tenants/:tenantId/prepare-rollout", async (c) => {
  const denied = requirePlatformAuth(c);
  if (denied) return denied;

  try {
    const result = await prepareTenantRollout(c.env, c.req.param("tenantId"));
    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: message }, 500);
  }
});

app.post("/internal/deployments/:deploymentId/tenants/:tenantId/complete", async (c) => {
  const denied = requirePlatformAuth(c);
  if (denied) return denied;

  const body = await c.req.json<{
    status: "running" | "completed" | "failed";
    pages_deployment_id?: string;
    error?: string;
    git_sha?: string;
  }>();

  if (!body.status) {
    return c.json({ error: "status is required" }, 400);
  }

  await recordTenantDeployment(
    c.env,
    c.req.param("deploymentId"),
    c.req.param("tenantId"),
    {
      status: body.status,
      pagesDeploymentId: body.pages_deployment_id ?? null,
      error: body.error ?? null,
      gitSha: body.git_sha ?? null,
    }
  );

  return c.json({ ok: true });
});

app.post("/internal/deployments/:deploymentId/tenants/:tenantId/git-rollout", async (c) => {
  const denied = requirePlatformAuth(c);
  if (denied) return denied;

  const deployment = await getDeployment(c.env, c.req.param("deploymentId"));
  if (!deployment) return c.json({ error: "Deployment not found" }, 404);

  const body = (await c.req
    .json<{ max_wait_ms?: number }>()
    .catch(() => ({}))) as { max_wait_ms?: number };
  const result = await rolloutTenantViaGit(
    c.env,
    c.req.param("deploymentId"),
    c.req.param("tenantId"),
    deployment.deployment.git_sha,
    body.max_wait_ms ?? 600_000
  );

  return c.json(result, result.ok ? 200 : 500);
});

app.post("/internal/tenants/:tenantId/health", async (c) => {
  const denied = requirePlatformAuth(c);
  if (denied) return denied;

  const tenant = await c.env.DB.prepare(
    "SELECT production_url, slug FROM tenants WHERE id = ? OR slug = ? LIMIT 1"
  )
    .bind(c.req.param("tenantId"), c.req.param("tenantId"))
    .first<{ production_url: string; slug: string }>();

  if (!tenant) return c.json({ error: "Tenant not found" }, 404);

  try {
    await checkTenantHealth(tenant.production_url);
    return c.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ ok: false, error: message }, 503);
  }
});

export default {
  fetch: app.fetch,
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ) {
    ctx.waitUntil(runTrialCron(env));
  },
};
