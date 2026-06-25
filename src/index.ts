import { Hono } from "hono";
import { requirePlatformAuth } from "./auth";
import type { Env, Tenant } from "./types";
import { createSignupTenant, enqueueProvisioning, getSetupStatus } from "./services/signup";
import { getPlan, formatUgx, PLANS } from "./config/plans";
import {
  submitSubscriptionOrder,
  getTransactionStatus,
  isPaymentCompleted,
} from "./services/pesapal";
import { runTrialCron } from "./services/trial-cron";
import { signupPageHtml, subscribePageHtml, setupPageHtml } from "./views/pages";

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) =>
  c.json({
    status: "ok",
    service: "school-platform",
    billing_currency: c.env.BILLING_CURRENCY ?? "UGX",
    timestamp: new Date().toISOString(),
  })
);

app.get("/", (c) => c.redirect("/signup"));

app.get("/signup", (c) => c.html(signupPageHtml(c.env)));

app.get("/setup/:tenantId", async (c) => {
  const status = await getSetupStatus(c.env, c.req.param("tenantId"));
  if (!status) return c.text("Not found", 404);
  return c.html(setupPageHtml(status.tenant, status.jobs, c.env));
});

app.get("/subscribe", (c) => c.html(subscribePageHtml(c.env)));

app.get("/api/plans", (c) =>
  c.json({
    currency: "UGX",
    plans: Object.values(PLANS).map((p) => ({
      ...p,
      formatted: formatUgx(p.monthlyAmountUgx),
    })),
  })
);

app.post("/api/signup", async (c) => {
  const body = await c.req.json<{
    school_name: string;
    slug?: string;
    admin_email: string;
    admin_phone?: string;
    plan?: string;
  }>();

  const result = await createSignupTenant(c.env, body);
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
    production_url: body.production_url ?? `https://${body.slug}.samabrains.com`,
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

  const result = await c.env.DB.prepare(
    "UPDATE tenants SET status = ?, suspended_at = CASE WHEN ? = 'suspended' THEN ? ELSE suspended_at END WHERE id = ? OR slug = ?"
  )
    .bind(status, status, Math.floor(Date.now() / 1000), id, id)
    .run();

  if (!result.meta.changes) return c.json({ error: "Tenant not found" }, { status: 404 });
  return c.json({ success: true, status });
});

app.get("/internal/tenants/active", async (c) => {
  const denied = requirePlatformAuth(c);
  if (denied) return denied;

  const { results } = await c.env.DB.prepare(
    "SELECT id, slug, pages_project_name, d1_database_id, production_url, status FROM tenants WHERE status IN ('trialing', 'active') ORDER BY slug"
  ).all();

  return c.json({ tenants: results ?? [] });
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
