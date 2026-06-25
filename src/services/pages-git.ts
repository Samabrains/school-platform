import type { Env } from "../types";

type CfResult<T> = { success: boolean; result?: T; errors?: unknown[] };

type DeploymentStage = {
  name: string;
  status: "success" | "idle" | "active" | "failure" | "canceled";
};

type PagesDeployment = {
  id: string;
  url: string;
  latest_stage: DeploymentStage;
  stages: DeploymentStage[];
};

type PagesProject = {
  name: string;
  subdomain: string;
  source?: { type?: string };
};

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
      signal: AbortSignal.timeout(120_000),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    }
  );

  const data = (await res.json()) as CfResult<T>;
  if (!data.success) {
    const msg = JSON.stringify(data.errors);
    if (msg.includes("8000011")) {
      throw new Error(
        `Cloudflare Pages Git installation is broken on this account. ` +
          `In GitHub go to Settings → Applications → Cloudflare Workers and Pages → Configure, ` +
          `reinstall the app for org Samabrains and repo core-school-template on the same Cloudflare account as school-platform. ` +
          `Or run: npm run tenant:complete -- --slug=<slug> for direct upload. Details: ${msg}`
      );
    }
    if (msg.includes("Git")) {
      throw new Error(
        `Cloudflare GitHub not linked. Install the app: https://github.com/apps/cloudflare-workers-and-pages/installations/new — choose Samabrains and core-school-template. Details: ${msg}`
      );
    }
    throw new Error(`Cloudflare API ${path}: ${msg}`);
  }
  return data.result as T;
}

function templateConfig(env: Env) {
  return {
    owner: env.TEMPLATE_GITHUB_OWNER ?? "Samabrains",
    repo: env.TEMPLATE_GITHUB_REPO ?? "core-school-template",
    branch: env.TEMPLATE_GITHUB_BRANCH ?? "main",
    buildCommand:
      env.TEMPLATE_BUILD_COMMAND ??
      "npm ci && npm run build && npm run pages:build",
    outputDir: env.TEMPLATE_BUILD_OUTPUT_DIR ?? ".vercel/output/static",
  };
}

function gitSourceBody(env: Env) {
  const { owner, repo, branch, buildCommand, outputDir } = templateConfig(env);
  return {
    production_branch: branch,
    build_config: {
      build_command: buildCommand,
      destination_dir: outputDir,
      root_dir: "",
      build_caching: true,
    },
    source: {
      type: "github",
      config: {
        owner,
        repo_name: repo,
        production_branch: branch,
        deployments_enabled: true,
        production_deployments_enabled: true,
        preview_deployment_setting: "none",
        pr_comments_enabled: false,
      },
    },
  };
}

/** Create a Pages project for direct upload (no Git). */
export async function createDirectUploadPagesProject(env: Env, name: string) {
  try {
    return await cfFetch<PagesProject>(env, "/pages/projects", {
      method: "POST",
      body: JSON.stringify({ name, production_branch: "main" }),
    });
  } catch {
    return getPagesProject(env, name);
  }
}

/** Create a Pages project already linked to the template GitHub repo. */
export async function createGitConnectedPagesProject(env: Env, name: string) {
  return cfFetch<PagesProject>(env, "/pages/projects", {
    method: "POST",
    body: JSON.stringify({ name, ...gitSourceBody(env) }),
  });
}

export async function getPagesProject(env: Env, name: string) {
  return cfFetch<PagesProject>(env, `/pages/projects/${name}`);
}

export async function deletePagesProject(env: Env, name: string) {
  await cfFetch(env, `/pages/projects/${name}`, { method: "DELETE" });
}

/** Sync build command / output dir on a Git-connected Pages project. */
export async function syncPagesGitBuildConfig(env: Env, projectName: string) {
  const { branch, buildCommand, outputDir } = templateConfig(env);
  await cfFetch(env, `/pages/projects/${projectName}`, {
    method: "PATCH",
    body: JSON.stringify({
      production_branch: branch,
      build_config: {
        build_command: buildCommand,
        destination_dir: outputDir,
        root_dir: "",
        build_caching: true,
      },
    }),
  });
}

/**
 * Create or ensure a Pages project linked to Samabrains/core-school-template.
 * Deploys always come from that Git repo (not direct upload).
 */
export async function ensureGitConnectedPagesProject(
  env: Env,
  projectName: string
): Promise<PagesProject> {
  let project: PagesProject | null = null;

  try {
    project = await getPagesProject(env, projectName);
  } catch {
    /* project does not exist yet */
  }

  if (project?.source?.type === "github") {
    await syncPagesGitBuildConfig(env, projectName);
    return project;
  }

  if (project) {
    await deletePagesProject(env, projectName);
  }

  const created = await createGitConnectedPagesProject(env, projectName);
  await syncPagesGitBuildConfig(env, projectName);

  const verified = await getPagesProject(env, projectName);
  if (verified.source?.type !== "github") {
    throw new Error(
      `Pages project ${projectName} was created but is not linked to GitHub`
    );
  }

  return verified.subdomain ? verified : created;
}

/** Trigger a production build from the connected Git branch. */
export async function triggerPagesGitDeploy(
  env: Env,
  projectName: string
): Promise<PagesDeployment> {
  const { branch } = templateConfig(env);

  return cfFetch<PagesDeployment>(
    env,
    `/pages/projects/${projectName}/deployments`,
    {
      method: "POST",
      body: JSON.stringify({ branch }),
    }
  );
}

export async function getPagesDeployment(
  env: Env,
  projectName: string,
  deploymentId: string
) {
  return cfFetch<PagesDeployment>(
    env,
    `/pages/projects/${projectName}/deployments/${deploymentId}`
  );
}

export async function getLatestPagesDeployment(env: Env, projectName: string) {
  const list = await cfFetch<PagesDeployment[]>(
    env,
    `/pages/projects/${projectName}/deployments?per_page=1`
  );
  return list?.[0] ?? null;
}

export function deploymentJobRef(deploymentId: string) {
  return `dep:${deploymentId}`;
}

export function parseDeploymentJobRef(error: string | null) {
  if (!error?.startsWith("dep:")) return null;
  return error.slice(4);
}

export function isPagesDeploymentSuccess(deployment: PagesDeployment) {
  return deploymentSucceeded(deployment);
}

export function isPagesDeploymentFailure(deployment: PagesDeployment) {
  return deploymentFailed(deployment);
}

function deploymentFailed(deployment: PagesDeployment) {
  const stages = deployment.stages ?? [];
  return stages.some((s) => s.status === "failure" || s.status === "canceled");
}

function deploymentSucceeded(deployment: PagesDeployment) {
  return deployment.latest_stage?.status === "success";
}

/** Poll until the Pages Git build finishes (default up to ~20 minutes). */
export async function waitForPagesDeployment(
  env: Env,
  projectName: string,
  deploymentId: string,
  maxWaitMs = 1_200_000
) {
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    const deployment = await getPagesDeployment(env, projectName, deploymentId);

    if (deploymentSucceeded(deployment)) return deployment;
    if (deploymentFailed(deployment)) {
      throw new Error(
        `Pages build failed for ${projectName} (deployment ${deploymentId})`
      );
    }

    await new Promise((r) => setTimeout(r, 20_000));
  }

  throw new Error(`Pages build timed out for ${projectName}`);
}

export async function bootstrapTenantSite(
  productionUrl: string,
  cronSecret: string
) {
  const base = productionUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/api/admin/bootstrap`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cronSecret}` },
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Bootstrap failed (${res.status}): ${body.slice(0, 200)}`);
  }
}

/** GET /api/health must return status ok before tenant goes live. */
export async function checkTenantHealth(
  productionUrl: string,
  maxAttempts = 6
) {
  const base = productionUrl.replace(/\/$/, "");
  let lastError = "unknown";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(`${base}/api/health`, {
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) {
        const data = (await res.json()) as { status?: string };
        if (data.status === "ok") return;
        lastError = `status=${data.status ?? "missing"}`;
      } else {
        lastError = `HTTP ${res.status}`;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 10_000));
    }
  }

  throw new Error(`Health check failed: ${lastError}`);
}
