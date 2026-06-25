import type { Context } from "hono";
import type { Env } from "./types";

export function requirePlatformAuth(c: Context<{ Bindings: Env }>) {
  const secret = c.env.PLATFORM_API_SECRET;
  if (!secret) {
    return c.json({ error: "Platform API secret not configured" }, { status: 503 });
  }

  const auth = c.req.header("Authorization");
  if (auth !== `Bearer ${secret}`) {
    return c.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
