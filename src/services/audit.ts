import type { Env } from "../types";

export async function logOpsAction(
  env: Env,
  input: {
    action: string;
    tenantId?: string | null;
    tenantSlug?: string | null;
    detail?: string | null;
  }
) {
  await env.DB.prepare(
    `INSERT INTO ops_audit_log (id, action, tenant_id, tenant_slug, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(
      crypto.randomUUID(),
      input.action,
      input.tenantId ?? null,
      input.tenantSlug ?? null,
      input.detail ?? null,
      Math.floor(Date.now() / 1000)
    )
    .run();
}

export async function listOpsAuditLog(env: Env, limit = 50) {
  const { results } = await env.DB.prepare(
    `SELECT id, action, tenant_id, tenant_slug, detail, created_at
     FROM ops_audit_log ORDER BY created_at DESC LIMIT ?`
  )
    .bind(limit)
    .all();

  return results ?? [];
}
