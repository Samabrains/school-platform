import type { Env } from "../types";
import { applyTenantD1Migrations, pagesDevUrl } from "./tenant-d1";
import {
  bootstrapTenantSite,
  checkTenantHealth,
  deploymentJobRef,
  ensureGitConnectedPagesProject,
  getLatestPagesDeployment,
  getPagesDeployment,
  isPagesDeploymentFailure,
  isPagesDeploymentSuccess,
  parseDeploymentJobRef,
  triggerPagesGitDeploy,
  waitForPagesDeployment,
} from "./pages-git";

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
      signal: AbortSignal.timeout(60_000),
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
  let createError: unknown;
  try {
    return await cfFetch<{ uuid: string; name: string }>(env, "/d1/database", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  } catch (err) {
    createError = err;
    const list = await cfFetch<{ uuid: string; name: string }[]>(
      env,
      "/d1/database"
    );
    const existing = list?.find((db) => db.name === name);
    if (existing) return existing;
    const detail =
      createError instanceof Error ? createError.message : String(createError);
    throw new Error(`D1 database ${name}: ${detail}`);
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
  return ensureGitConnectedPagesProject(env, name);
}

export async function applyTenantPagesConfig(env: Env, tenantId: string) {
  const refreshed = await env.DB.prepare("SELECT * FROM tenants WHERE id = ?")
    .bind(tenantId)
    .first<Record<string, string | number | null>>();

  if (!refreshed?.d1_database_id) throw new Error("Missing D1 id");

  const slug = String(refreshed.slug);
  const trialEnds = Number(refreshed.trial_ends_at);
  const plan = String(refreshed.plan);
  const isStarter = plan === "starter";

  let cronSecret = refreshed.cron_secret
    ? String(refreshed.cron_secret)
    : crypto.randomUUID() + crypto.randomUUID();

  if (!refreshed.cron_secret) {
    await env.DB.prepare("UPDATE tenants SET cron_secret = ? WHERE id = ?")
      .bind(cronSecret, tenantId)
      .run();
  }

  const jwtSecret = crypto.randomUUID() + crypto.randomUUID();

  await configurePagesProjectProduction(env, slug, {
    d1DatabaseId: String(refreshed.d1_database_id),
    r2Bucket: `${slug}-r2-production`,
    r2BackupsBucket: `${slug}-r2-backups-prod`,
    vectorizeIndex: `${slug}-handbook-prod`,
    secrets: {
      JWT_SECRET: jwtSecret,
      CRON_SECRET: cronSecret,
      PLATFORM_AUTH_SECRET: env.PLATFORM_AUTH_SECRET ?? "",
      BREVO_API_KEY: env.BREVO_API_KEY ?? "",
    },
    plainText: {
      ADMIN_EMAIL: String(refreshed.admin_email),
      NEXT_PUBLIC_ENABLE_ADMIN_PIN: "false",
      PLATFORM_TENANT_ID: tenantId,
      PLATFORM_API_URL: env.PLATFORM_PUBLIC_URL ?? "",
      TENANT_BILLING_STATUS: "trial",
      TRIAL_ENDS_AT: String(trialEnds),
      CLOUDFLARE_D1_DATABASE_ID: String(refreshed.d1_database_id),
      CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID ?? "",
      CONTACT_EMAIL_TO: String(refreshed.admin_email),
      BREVO_SENDER_EMAIL: env.BREVO_SENDER_EMAIL ?? "noreply@samabrains.com",
      NEXT_PUBLIC_SCHOOL_NAME: String(refreshed.school_name),
      NEXT_PUBLIC_TAGLINE: "Excellence in Every Classroom",
      NEXT_PUBLIC_PRIMARY_COLOR: "#1E3A8A",
      NEXT_PUBLIC_SECONDARY_COLOR: "#F59E0B",
      NEXT_PUBLIC_ENABLE_CHATBOT: "true",
      NEXT_PUBLIC_ENABLE_ALUMNI_PORTAL: isStarter ? "false" : "true",
      NEXT_PUBLIC_ENABLE_CAREERS: isStarter ? "false" : "true",
      NODE_VERSION: "22",
    },
  });
}

export async function configurePagesProjectProduction(
  env: Env,
  projectName: string,
  config: {
    d1DatabaseId: string;
    r2Bucket: string;
    r2BackupsBucket: string;
    vectorizeIndex: string;
    secrets: Record<string, string>;
    plainText: Record<string, string>;
  }
) {
  const envVars: Record<string, { type: string; value: string }> = {};

  for (const [key, value] of Object.entries(config.secrets)) {
    if (value) envVars[key] = { type: "secret_text", value };
  }
  for (const [key, value] of Object.entries(config.plainText)) {
    if (value) envVars[key] = { type: "plain_text", value };
  }

  await cfFetch(env, `/pages/projects/${projectName}`, {
    method: "PATCH",
    body: JSON.stringify({
      deployment_configs: {
        production: {
          compatibility_date: "2024-09-23",
          compatibility_flags: ["nodejs_compat"],
          usage_model: "standard",
          d1_databases: {
            DB: { id: config.d1DatabaseId },
          },
          r2_buckets: {
            STORAGE: { name: config.r2Bucket },
            BACKUPS_STORAGE: { name: config.r2BackupsBucket },
          },
          vectorize_bindings: {
            VECTORIZE_INDEX: { index_name: config.vectorizeIndex },
          },
          ai_bindings: {
            AI: {},
          },
          env_vars: envVars,
        },
      },
    }),
  });
}

export function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export function normalizeSlug(input: string) {
  return slugify(input);
}

export function isValidSlug(slug: string) {
  return (
    slug.length >= 3 &&
    slug.length <= 48 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
  );
}

export async function runProvisioningPipeline(
  env: Env,
  tenantId: string
): Promise<"complete" | "deferred"> {
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
    "deploy",
    "bootstrap",
    "health",
  ] as const;

  for (const step of steps) {
    const jobId = `${tenantId}-${step}`;
    const existing = await env.DB.prepare(
      "SELECT status FROM provisioning_jobs WHERE id = ?"
    )
      .bind(jobId)
      .first<{ status: string }>();

    if (existing?.status === "done") continue;

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
        const project = await ensureGitConnectedPagesProject(env, slug);
        const url = pagesDevUrl(project.subdomain ?? slug);
        await env.DB.prepare(
          "UPDATE tenants SET pages_project_name = ?, production_url = ? WHERE id = ?"
        )
          .bind(slug, url, tenantId)
          .run();
      }

      if (step === "secrets") {
        await applyTenantPagesConfig(env, tenantId);
      }

      if (step === "migrate") {
        const refreshed = await env.DB.prepare(
          "SELECT d1_database_id FROM tenants WHERE id = ?"
        )
          .bind(tenantId)
          .first<{ d1_database_id: string }>();

        if (!refreshed?.d1_database_id) throw new Error("Missing D1 id");
        await applyTenantD1Migrations(env, refreshed.d1_database_id);
      }

      if (step === "deploy") {
        await applyTenantPagesConfig(env, tenantId);
        const deployment = await triggerPagesGitDeploy(env, slug);
        await upsertJob(
          env,
          tenantId,
          step,
          "running",
          deploymentJobRef(deployment.id)
        );

        try {
          await waitForPagesDeployment(env, slug, deployment.id, 60_000);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          if (message.includes("timed out")) {
            return "deferred";
          }
          throw error;
        }
      }

      if (step === "bootstrap") {
        const refreshed = await env.DB.prepare(
          "SELECT production_url, cron_secret FROM tenants WHERE id = ?"
        )
          .bind(tenantId)
          .first<{ production_url: string; cron_secret: string | null }>();

        if (!refreshed?.cron_secret) {
          throw new Error("Missing cron_secret for bootstrap");
        }
        await bootstrapTenantSite(
          pagesDevUrl(slug),
          refreshed.cron_secret
        );
      }

      if (step === "health") {
        await checkTenantHealth(pagesDevUrl(slug));
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

  return "complete";
}

/** Resume deploy → bootstrap when the worker outlives the initial build wait. */
export async function tryFinishProvisioning(
  env: Env,
  tenantId: string
): Promise<boolean> {
  const tenant = await env.DB.prepare("SELECT * FROM tenants WHERE id = ?")
    .bind(tenantId)
    .first<Record<string, string | number | null>>();

  if (!tenant || tenant.status !== "provisioning") return false;

  const slug = String(tenant.slug);
  const fixedUrl = pagesDevUrl(slug);
  if (tenant.production_url !== fixedUrl) {
    await env.DB.prepare(
      "UPDATE tenants SET production_url = ? WHERE id = ?"
    )
      .bind(fixedUrl, tenantId)
      .run();
    tenant.production_url = fixedUrl;
  }

  const deployJob = await env.DB.prepare(
    "SELECT status, error FROM provisioning_jobs WHERE id = ?"
  )
    .bind(`${tenantId}-deploy`)
    .first<{ status: string; error: string | null }>();

  if (!deployJob || deployJob.status === "failed") return false;

  if (deployJob.status !== "done") {
    let deploymentId = parseDeploymentJobRef(deployJob.error);
    let deployment = deploymentId
      ? await getPagesDeployment(env, slug, deploymentId)
      : await getLatestPagesDeployment(env, slug);

    if (!deployment) return false;

    if (isPagesDeploymentFailure(deployment)) {
      await upsertJob(env, tenantId, "deploy", "failed", "Website build failed");
      await env.DB.prepare("UPDATE tenants SET status = ? WHERE id = ?")
        .bind("draft", tenantId)
        .run();
      return false;
    }

    if (!isPagesDeploymentSuccess(deployment)) return false;

    await applyTenantPagesConfig(env, tenantId);
    await upsertJob(env, tenantId, "deploy", "done");
  }

  const bootstrapJob = await env.DB.prepare(
    "SELECT status FROM provisioning_jobs WHERE id = ?"
  )
    .bind(`${tenantId}-bootstrap`)
    .first<{ status: string }>();

  if (bootstrapJob?.status !== "done") {
    await upsertJob(env, tenantId, "bootstrap", "running");
    const refreshed = await env.DB.prepare(
      "SELECT production_url, cron_secret FROM tenants WHERE id = ?"
    )
      .bind(tenantId)
      .first<{ production_url: string; cron_secret: string | null }>();

    if (!refreshed?.cron_secret) {
      await upsertJob(
        env,
        tenantId,
        "bootstrap",
        "failed",
        "Missing cron_secret"
      );
      return false;
    }

    try {
      await bootstrapTenantSite(
        pagesDevUrl(slug),
        refreshed.cron_secret
      );
      await upsertJob(env, tenantId, "bootstrap", "done");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bootstrap failed";
      await upsertJob(env, tenantId, "bootstrap", "failed", message);
      return false;
    }
  }

  const healthJob = await env.DB.prepare(
    "SELECT status FROM provisioning_jobs WHERE id = ?"
  )
    .bind(`${tenantId}-health`)
    .first<{ status: string }>();

  if (healthJob?.status !== "done") {
    await upsertJob(env, tenantId, "health", "running");
    try {
      await checkTenantHealth(pagesDevUrl(slug));
      await upsertJob(env, tenantId, "health", "done");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Health check failed";
      await upsertJob(env, tenantId, "health", "failed", message);
      return false;
    }
  }

  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "UPDATE tenants SET status = ?, provisioned_at = ? WHERE id = ?"
  )
    .bind("trialing", now, tenantId)
    .run();

  return true;
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
