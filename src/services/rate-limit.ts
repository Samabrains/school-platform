import type { Env } from "../types";

const WINDOW_SECONDS = 3600;
const MAX_PER_IP = 5;

async function hashIp(ip: string) {
  const data = new TextEncoder().encode(ip);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function checkSignupRateLimit(env: Env, ip: string) {
  if (!ip || ip === "unknown") return { allowed: true as const };

  const ipHash = await hashIp(ip);
  const since = Math.floor(Date.now() / 1000) - WINDOW_SECONDS;

  const row = await env.DB.prepare(
    "SELECT COUNT(*) as count FROM signup_rate_limits WHERE ip_hash = ? AND created_at > ?"
  )
    .bind(ipHash, since)
    .first<{ count: number }>();

  if ((row?.count ?? 0) >= MAX_PER_IP) {
    return {
      allowed: false as const,
      error: "Too many signups from this network. Try again in an hour.",
    };
  }

  await env.DB.prepare(
    "INSERT INTO signup_rate_limits (ip_hash, created_at) VALUES (?, ?)"
  )
    .bind(ipHash, Math.floor(Date.now() / 1000))
    .run();

  return { allowed: true as const };
}
