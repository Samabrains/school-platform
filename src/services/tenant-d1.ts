/**
 * Apply core-school-template D1 schema to a tenant database via Cloudflare API.
 */
import type { Env } from "../types";
import { TENANT_D1_STATEMENTS } from "../data/tenant-d1-migrations";

type CfResult<T> = { success: boolean; result?: T; errors?: unknown[] };

async function d1Query(
  env: Env,
  databaseId: string,
  sql: string,
  params: unknown[] = []
) {
  const token = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !accountId) {
    throw new Error("Cloudflare API credentials not configured");
  }

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: "POST",
      signal: AbortSignal.timeout(60_000),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql, params }),
    }
  );

  const data = (await res.json()) as CfResult<unknown>;
  if (!data.success) {
    throw new Error(
      `D1 query failed: ${JSON.stringify(data.errors)} — ${sql.slice(0, 80)}`
    );
  }
}

export async function applyTenantD1Migrations(env: Env, databaseId: string) {
  for (const sql of TENANT_D1_STATEMENTS) {
    try {
      await d1Query(env, databaseId, sql);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Idempotent re-runs: skip "already exists" errors
      if (
        /already exists|duplicate column|UNIQUE constraint failed/i.test(msg)
      ) {
        continue;
      }
      throw err;
    }
  }
}

export function pagesDevUrl(slugOrSubdomain: string) {
  const base = slugOrSubdomain.replace(/\.pages\.dev$/i, "").trim();
  return `https://${base}.pages.dev`;
}

/** Persist admin auth config in tenant D1 (survives Pages env injection issues). */
export async function seedTenantAuthSettings(
  env: Env,
  databaseId: string,
  input: { adminEmail: string; jwtSecret: string }
) {
  const pairs: [string, string][] = [
    ["admin_email", input.adminEmail.toLowerCase()],
    ["jwt_secret", input.jwtSecret],
  ];

  for (const [key, value] of pairs) {
    await d1Query(
      env,
      databaseId,
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = strftime('%s', 'now')`,
      [key, value]
    );
  }
}
