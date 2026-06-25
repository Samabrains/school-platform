import type { Env } from "../types";
import { tryFinishProvisioning } from "./provision";
import { sendWelcomeEmail } from "./signup";
import { sendPlatformEmail } from "./email";
import { getPlan, formatUgx } from "../config/plans";
import type { Tenant } from "../types";

export async function runTrialCron(env: Env) {
  const { results: provisioning } = await env.DB.prepare(
    "SELECT id FROM tenants WHERE status = 'provisioning'"
  ).all<{ id: string }>();

  for (const row of provisioning ?? []) {
    try {
      if (await tryFinishProvisioning(env, row.id)) {
        await sendWelcomeEmail(env, row.id);
      }
    } catch (e) {
      console.error("Provisioning resume failed:", row.id, e);
    }
  }

  const now = Math.floor(Date.now() / 1000);
  const fiveDays = 5 * 24 * 60 * 60;

  const { results: trialing } = await env.DB.prepare(
    "SELECT * FROM tenants WHERE status = 'trialing' AND billing_status = 'trial'"
  ).all<Tenant>();

  for (const tenant of trialing ?? []) {
    if (!tenant.trial_ends_at) continue;

    const daysLeft = Math.ceil((tenant.trial_ends_at - now) / 86400);
    const subscribeUrl = `${env.PLATFORM_PUBLIC_URL ?? ""}/subscribe?tenant=${tenant.id}`;

    if (daysLeft === 5 || daysLeft === 1) {
      const type = daysLeft === 5 ? "trial_reminder_25" : "trial_reminder_29";
      const sent = await env.DB.prepare(
        "SELECT id FROM notification_log WHERE tenant_id = ? AND type = ?"
      )
        .bind(tenant.id, type)
        .first();

      if (!sent) {
        const plan = getPlan(tenant.plan);
        await sendPlatformEmail(env, {
          to: [{ email: tenant.admin_email, name: tenant.school_name }],
          subject: `${daysLeft} day${daysLeft === 1 ? "" : "s"} left on your trial`,
          htmlContent: `
            <p>Your trial for <strong>${tenant.school_name}</strong> ends in ${daysLeft} day(s).</p>
            <p>Subscribe to keep your site live: <a href="${subscribeUrl}">${subscribeUrl}</a></p>
            <p>Plan: ${plan?.name ?? tenant.plan} — ${plan ? formatUgx(plan.monthlyAmountUgx) : ""}/month</p>
          `,
        });
        await env.DB.prepare(
          "INSERT INTO notification_log (id, tenant_id, type, sent_at) VALUES (?, ?, ?, ?)"
        )
          .bind(crypto.randomUUID(), tenant.id, type, now)
          .run();
      }
    }

    if (tenant.trial_ends_at < now) {
      await env.DB.prepare(
        "UPDATE tenants SET status = ?, billing_status = ?, suspended_at = ? WHERE id = ?"
      )
        .bind("suspended", "past_due", now, tenant.id)
        .run();
    }
  }
}
