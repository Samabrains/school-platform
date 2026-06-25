import type { Env, Tenant } from "../types";

type CfResult<T> = { success: boolean; result?: T; errors?: unknown[] };

type DeleteStepResult = { step: string; ok: boolean; detail?: string };

async function cfDelete(
  env: Env,
  path: string
): Promise<DeleteStepResult> {
  const token = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !accountId) {
    return { step: path, ok: false, detail: "Cloudflare API not configured" };
  }

  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`,
      {
        method: "DELETE",
        signal: AbortSignal.timeout(60_000),
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    const data = (await res.json()) as CfResult<unknown>;
    if (!data.success) {
      const msg = JSON.stringify(data.errors);
      const notFound = /not found|8000007|10006/i.test(msg);
      return {
        step: path,
        ok: notFound,
        detail: notFound ? "already gone" : msg,
      };
    }
    return { step: path, ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { step: path, ok: false, detail: message };
  }
}

export async function deleteTenantCompletely(
  env: Env,
  tenantIdOrSlug: string,
  options?: { confirmSlug?: string }
): Promise<{
  tenant: Pick<Tenant, "id" | "slug" | "school_name">;
  steps: DeleteStepResult[];
}> {
  const tenant = await env.DB.prepare(
    "SELECT * FROM tenants WHERE id = ? OR slug = ? LIMIT 1"
  )
    .bind(tenantIdOrSlug, tenantIdOrSlug)
    .first<Tenant>();

  if (!tenant) {
    throw new Error("Tenant not found");
  }

  if (options?.confirmSlug && options.confirmSlug !== tenant.slug) {
    throw new Error("Confirmation slug does not match");
  }

  const slug = tenant.slug;
  const steps: DeleteStepResult[] = [];

  steps.push(
    await cfDelete(env, `/pages/projects/${encodeURIComponent(slug)}`)
  );

  if (tenant.d1_database_id) {
    steps.push(
      await cfDelete(env, `/d1/database/${tenant.d1_database_id}`)
    );
  } else {
    steps.push({
      step: "d1",
      ok: true,
      detail: "no database id on record",
    });
  }

  steps.push(await cfDelete(env, `/r2/buckets/${slug}-r2-production`));
  steps.push(await cfDelete(env, `/r2/buckets/${slug}-r2-backups-prod`));
  steps.push(
    await cfDelete(env, `/vectorize/indexes/${slug}-handbook-prod`)
  );

  await env.DB.prepare("DELETE FROM provisioning_jobs WHERE tenant_id = ?")
    .bind(tenant.id)
    .run();
  steps.push({ step: "db:provisioning_jobs", ok: true });

  await env.DB.prepare("DELETE FROM billing_events WHERE tenant_id = ?")
    .bind(tenant.id)
    .run();
  steps.push({ step: "db:billing_events", ok: true });

  await env.DB.prepare("DELETE FROM admin_magic_links WHERE tenant_id = ?")
    .bind(tenant.id)
    .run();
  steps.push({ step: "db:admin_magic_links", ok: true });

  await env.DB.prepare("DELETE FROM notification_log WHERE tenant_id = ?")
    .bind(tenant.id)
    .run();
  steps.push({ step: "db:notification_log", ok: true });

  await env.DB.prepare("DELETE FROM tenant_deployments WHERE tenant_id = ?")
    .bind(tenant.id)
    .run();
  steps.push({ step: "db:tenant_deployments", ok: true });

  await env.DB.prepare("DELETE FROM tenants WHERE id = ?")
    .bind(tenant.id)
    .run();
  steps.push({ step: "db:tenants", ok: true });

  return {
    tenant: {
      id: tenant.id,
      slug: tenant.slug,
      school_name: tenant.school_name,
    },
    steps,
  };
}
