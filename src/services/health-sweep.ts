import type { Env } from "../types";
import { checkTenantHealth } from "./pages-git";
import { getActiveTenantsForRollout } from "./rollout";

export async function healthSweepAllTenants(env: Env) {
  const tenants = await getActiveTenantsForRollout(env);
  const results: { slug: string; url: string; ok: boolean; error?: string }[] = [];

  for (const tenant of tenants) {
    const url = tenant.production_url;
    try {
      await checkTenantHealth(url);
      results.push({ slug: tenant.slug, url, ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ slug: tenant.slug, url, ok: false, error: message });
    }
  }

  return {
    total: results.length,
    healthy: results.filter((r) => r.ok).length,
    unhealthy: results.filter((r) => !r.ok).length,
    results,
  };
}
