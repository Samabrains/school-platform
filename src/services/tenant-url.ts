import type { Env } from "../types";

/** Public URL for a school site (pages.dev or custom base domain). */
export function tenantPublicUrl(env: Env, slug: string) {
  const base = slug.replace(/\.(pages\.dev|samabrains\.com)$/i, "").trim();
  const domain = env.TENANT_BASE_DOMAIN?.trim();
  if (domain) {
    return `https://${base}.${domain.replace(/^\./, "")}`;
  }
  return `https://${base}.pages.dev`;
}
