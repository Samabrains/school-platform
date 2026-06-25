import { SignJWT, jwtVerify } from "jose";

const MAGIC_LINK_TTL = "15m";

export async function createAdminMagicLinkToken(
  secret: string,
  input: { tenantId: string; email: string; slug: string }
) {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({
    purpose: "admin_magic_link",
    tenantId: input.tenantId,
    email: input.email,
    slug: input.slug,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(MAGIC_LINK_TTL)
    .sign(key);
}

export async function verifyAdminMagicLinkToken(secret: string, token: string) {
  const key = new TextEncoder().encode(secret);
  const { payload } = await jwtVerify(token, key);
  if (payload.purpose !== "admin_magic_link") {
    throw new Error("Invalid token purpose");
  }
  return payload as {
    tenantId: string;
    email: string;
    slug: string;
  };
}

export function buildMagicLinkUrl(productionUrl: string, token: string) {
  const base = productionUrl.replace(/\/$/, "");
  return `${base}/en/admin/auth/verify?token=${encodeURIComponent(token)}`;
}
