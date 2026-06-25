import type { Env } from "../types";

type CfResult<T> = { success: boolean; result?: T; errors?: unknown[] };

async function cfFetch<T>(
  env: Env,
  path: string,
  init?: RequestInit
): Promise<T> {
  const token = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !accountId) {
    throw new Error("Cloudflare API credentials not configured");
  }

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    }
  );

  const data = (await res.json()) as CfResult<T>;
  if (!data.success) {
    throw new Error(`Cloudflare API ${path}: ${JSON.stringify(data.errors)}`);
  }
  return data.result as T;
}

export async function createD1Database(env: Env, name: string) {
  try {
    return await cfFetch<{ uuid: string; name: string }>(env, "/d1/database", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  } catch {
    const list = await cfFetch<{ uuid: string; name: string }[]>(
      env,
      "/d1/database"
    );
    const existing = list?.find((db) => db.name === name);
    if (existing) return existing;
    throw new Error(`D1 database ${name} not found`);
  }
}

export async function createR2Bucket(env: Env, name: string) {
  try {
    await cfFetch(env, `/r2/buckets`, {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  } catch {
    // bucket may already exist
  }
}

export async function createVectorizeIndex(env: Env, name: string) {
  try {
    await cfFetch(env, "/vectorize/indexes", {
      method: "POST",
      body: JSON.stringify({
        name,
        config: { dimensions: 768, metric: "cosine" },
      }),
    });
  } catch {
    // index may already exist
  }
}

export async function createPagesProject(env: Env, name: string) {
  try {
    return await cfFetch<{ name: string; subdomain: string }>(env, "/pages/projects", {
      method: "POST",
      body: JSON.stringify({ name, production_branch: "main" }),
    });
  } catch {
    return cfFetch<{ name: string; subdomain: string }>(env, `/pages/projects/${name}`);
  }
}

export async function setPagesSecret(
  env: Env,
  projectName: string,
  secretName: string,
  secretValue: string
) {
  await cfFetch(env, `/pages/projects/${projectName}/secrets`, {
    method: "POST",
    body: JSON.stringify({
      name: secretName,
      value: secretValue,
      type: "secret_text",
    }),
  });
}

export async function setPagesPlaintextVar(
  env: Env,
  projectName: string,
  varName: string,
  value: string
) {
  await cfFetch(env, `/pages/projects/${projectName}/variables`, {
    method: "POST",
    body: JSON.stringify({
      name: varName,
      value,
      type: "plain_text",
    }),
  });
}

export function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export async function runProvisioningPipeline(
  env: Env,
  tenantId: string
): Promise<void> {
  const tenant = await env.DB.prepare("SELECT * FROM tenants WHERE id = ?")
    .bind(tenantId)
    .first<Record<string, string | number | null>>();

  if (!tenant) throw new Error("Tenant not found");

  const slug = String(tenant.slug);
  const dbName = `${slug}-d1-production`;

  const steps = [
    "d1",
    "r2",
    "vectorize",
    "pages",
    "secrets",
    "migrate",
  ] as const;

  for (const step of steps) {
    await upsertJob(env, tenantId, step, "running");

    try {
      if (step === "d1") {
        const db = await createD1Database(env, dbName);
        await env.DB.prepare(
          "UPDATE tenants SET d1_database_id = ? WHERE id = ?"
        )
          .bind(db.uuid, tenantId)
          .run();
      }

      if (step === "r2") {
        await createR2Bucket(env, `${slug}-r2-production`);
        await createR2Bucket(env, `${slug}-r2-backups-prod`);
        await env.DB.prepare("UPDATE tenants SET r2_bucket = ? WHERE id = ?")
          .bind(`${slug}-r2-production`, tenantId)
          .run();
      }

      if (step === "vectorize") {
        await createVectorizeIndex(env, `${slug}-handbook-prod`);
        await env.DB.prepare(
          "UPDATE tenants SET vectorize_index = ? WHERE id = ?"
        )
          .bind(`${slug}-handbook-prod`, tenantId)
          .run();
      }

      if (step === "pages") {
        const project = await createPagesProject(env, slug);
        const url =
          tenant.production_url ??
          `https://${project.subdomain ?? slug}.pages.dev`;
        await env.DB.prepare(
          "UPDATE tenants SET pages_project_name = ?, production_url = ? WHERE id = ?"
        )
          .bind(slug, url, tenantId)
          .run();
      }

      if (step === "secrets") {
        const refreshed = await env.DB.prepare(
          "SELECT * FROM tenants WHERE id = ?"
        )
          .bind(tenantId)
          .first<Record<string, string | number | null>>();

        if (!refreshed?.d1_database_id) throw new Error("Missing D1 id");

        const jwtSecret = crypto.randomUUID() + crypto.randomUUID();
        const cronSecret = crypto.randomUUID() + crypto.randomUUID();
        const trialEnds = Number(refreshed.trial_ends_at);
        const plan = String(refreshed.plan);
        const isStarter = plan === "starter";

        const secrets: Record<string, string> = {
          JWT_SECRET: jwtSecret,
          CRON_SECRET: cronSecret,
          ADMIN_EMAIL: String(refreshed.admin_email),
          ADMIN_PIN: String(Math.floor(1000 + Math.random() * 9000)),
          PLATFORM_TENANT_ID: tenantId,
          PLATFORM_AUTH_SECRET: env.PLATFORM_AUTH_SECRET ?? "",
          PLATFORM_API_URL: env.PLATFORM_PUBLIC_URL ?? "",
          TENANT_BILLING_STATUS: "trial",
          TRIAL_ENDS_AT: String(trialEnds),
          CLOUDFLARE_D1_DATABASE_ID: String(refreshed.d1_database_id),
          CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID ?? "",
          CLOUDFLARE_API_TOKEN: "configured-by-platform",
          CONTACT_EMAIL_TO: String(refreshed.admin_email),
          BREVO_SENDER_EMAIL: env.BREVO_SENDER_EMAIL ?? "noreply@samabrains.com",
          BREVO_API_KEY: env.BREVO_API_KEY ?? "",
          NEXT_PUBLIC_SCHOOL_NAME: String(refreshed.school_name),
          NEXT_PUBLIC_TAGLINE: "Excellence in Every Classroom",
          NEXT_PUBLIC_PRIMARY_COLOR: "#1E3A8A",
          NEXT_PUBLIC_SECONDARY_COLOR: "#F59E0B",
          NEXT_PUBLIC_ENABLE_CHATBOT: "true",
          NEXT_PUBLIC_ENABLE_ALUMNI_PORTAL: isStarter ? "false" : "true",
          NEXT_PUBLIC_ENABLE_CAREERS: isStarter ? "false" : "true",
        };

        for (const [key, value] of Object.entries(secrets)) {
          if (!value) continue;
          try {
            await setPagesSecret(env, slug, key, value);
          } catch (e) {
            console.warn(`Secret ${key}:`, e);
          }
        }
      }

      if (step === "migrate") {
        // D1 schema migrations require wrangler/CI — mark complete for Phase B
        // Deploy + migrate handled by GitHub Action (provision-tenant workflow)
      }

      await upsertJob(env, tenantId, step, "done");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await upsertJob(env, tenantId, step, "failed", message);
      throw error;
    }
  }

  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "UPDATE tenants SET status = ?, provisioned_at = ? WHERE id = ?"
  )
    .bind("trialing", now, tenantId)
    .run();
}

async function upsertJob(
  env: Env,
  tenantId: string,
  step: string,
  status: string,
  error?: string
) {
  const id = `${tenantId}-${step}`;
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO provisioning_jobs (id, tenant_id, step, status, error, attempts, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?)
     ON CONFLICT(id) DO UPDATE SET status = excluded.status, error = excluded.error, updated_at = excluded.updated_at`
  )
    .bind(id, tenantId, step, status, error ?? null, now)
    .run();
}
