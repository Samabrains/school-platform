import type { Env } from "../types";
import {
  createDeployment,
  finishDeployment,
  rolloutTenantViaGit,
} from "./rollout";

export async function redeployTenant(env: Env, tenantId: string) {
  const gitSha = env.TEMPLATE_GIT_SHA?.trim() || "ops-manual";
  const deployment = await createDeployment(env, gitSha, "ops-redeploy");

  const result = await rolloutTenantViaGit(
    env,
    deployment.id,
    tenantId,
    gitSha,
    600_000
  );

  await finishDeployment(
    env,
    deployment.id,
    result.ok ? "completed" : "failed"
  );

  return {
    deployment_id: deployment.id,
    ok: result.ok,
    pages_deployment_id: result.ok ? result.pagesDeploymentId : undefined,
    error: result.ok ? undefined : result.error,
  };
}
