import type { Env, Tenant } from "../types";

export async function resolveTenant(
  env: Env,
  idOrSlug: string
): Promise<Tenant | null> {
  return env.DB.prepare(
    "SELECT * FROM tenants WHERE id = ? OR slug = ? LIMIT 1"
  )
    .bind(idOrSlug, idOrSlug)
    .first<Tenant>();
}
