import type { Env, Tenant } from "../types";
import { slugify, runProvisioningPipeline } from "../services/provision";
import { getPlan } from "../config/plans";
import { createAdminMagicLinkToken, buildMagicLinkUrl } from "../services/magic-link";
import { sendPlatformEmail } from "../services/email";

const TRIAL_SECONDS = 30 * 24 * 60 * 60;

export async function createSignupTenant(
  env: Env,
  body: {
    school_name: string;
    slug?: string;
    admin_email: string;
    admin_phone?: string;
    plan?: string;
  }
) {
  const slug = body.slug?.trim() || slugify(body.school_name);
  const plan = body.plan ?? "starter";

  if (!slug || !body.school_name || !body.admin_email) {
    return { error: "school_name, admin_email required", status: 400 as const };
  }

  if (!getPlan(plan)) {
    return { error: "Invalid plan", status: 400 as const };
  }

  const existing = await env.DB.prepare("SELECT id FROM tenants WHERE slug = ?")
    .bind(slug)
    .first();

  if (existing) {
    return { error: "School URL already taken", status: 409 as const };
  }

  const now = Math.floor(Date.now() / 1000);
  const tenantId = `ten_${crypto.randomUUID()}`;

  const tenant: Partial<Tenant> & { admin_phone?: string } = {
    id: tenantId,
    slug,
    school_name: body.school_name,
    admin_email: body.admin_email.toLowerCase(),
    admin_phone: body.admin_phone,
    status: "provisioning",
    plan,
    billing_status: "trial",
    trial_ends_at: now + TRIAL_SECONDS,
    pesapal_account_number: `ten_${slug}`,
    pages_project_name: slug,
    production_url: `https://${slug}.samabrains.com`,
    d1_database_id: "",
    created_at: now,
  };

  await env.DB.prepare(
    `INSERT INTO tenants (
      id, slug, school_name, admin_email, admin_phone, status, plan, billing_status,
      trial_ends_at, pesapal_account_number, pages_project_name, production_url,
      d1_database_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      tenant.id,
      tenant.slug,
      tenant.school_name,
      tenant.admin_email,
      tenant.admin_phone ?? null,
      tenant.status,
      tenant.plan,
      tenant.billing_status,
      tenant.trial_ends_at,
      tenant.pesapal_account_number,
      tenant.pages_project_name,
      tenant.production_url,
      tenant.d1_database_id,
      tenant.created_at
    )
    .run();

  return { tenant, tenantId, status: 201 as const };
}

export async function sendWelcomeEmail(env: Env, tenantId: string) {
  const tenant = await env.DB.prepare("SELECT * FROM tenants WHERE id = ?")
    .bind(tenantId)
    .first<Tenant>();

  if (!tenant || !env.PLATFORM_AUTH_SECRET) return;

  const token = await createAdminMagicLinkToken(env.PLATFORM_AUTH_SECRET, {
    tenantId: tenant.id,
    email: tenant.admin_email,
    slug: tenant.slug,
  });

  const magicLink = buildMagicLinkUrl(tenant.production_url, token);
  const trialEnd = new Date((tenant.trial_ends_at ?? 0) * 1000).toLocaleDateString(
    "en-UG",
    { dateStyle: "long" }
  );

  await sendPlatformEmail(env, {
    to: [{ email: tenant.admin_email, name: tenant.school_name }],
    subject: `Your ${tenant.school_name} website is ready`,
    htmlContent: `
      <h1>Welcome to SamaBrains School Platform</h1>
      <p>Your 30-day free trial has started. Trial ends on <strong>${trialEnd}</strong>.</p>
      <p><a href="${magicLink}">Sign in to your admin dashboard</a> (link expires in 15 minutes).</p>
      <p>Your site: <a href="${tenant.production_url}">${tenant.production_url}</a></p>
    `,
  });
}

export function enqueueProvisioning(
  ctx: ExecutionContext,
  env: Env,
  tenantId: string
) {
  ctx.waitUntil(
    (async () => {
      try {
        await runProvisioningPipeline(env, tenantId);
        await sendWelcomeEmail(env, tenantId);
      } catch (error) {
        console.error("Provisioning failed:", tenantId, error);
        await env.DB.prepare("UPDATE tenants SET status = ? WHERE id = ?")
          .bind("draft", tenantId)
          .run();
      }
    })()
  );
}

export async function getSetupStatus(env: Env, tenantId: string) {
  const tenant = await env.DB.prepare(
    "SELECT id, slug, school_name, status, production_url, trial_ends_at, billing_status FROM tenants WHERE id = ? OR slug = ?"
  )
    .bind(tenantId, tenantId)
    .first<Tenant>();

  if (!tenant) return null;

  const { results: jobs } = await env.DB.prepare(
    "SELECT step, status, error FROM provisioning_jobs WHERE tenant_id = ? ORDER BY updated_at"
  )
    .bind(tenant.id)
    .all<{ step: string; status: string; error: string | null }>();

  return { tenant, jobs: jobs ?? [] };
}
