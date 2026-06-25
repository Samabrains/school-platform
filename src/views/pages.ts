import { formatUgx, PLANS } from "../config/plans";
import type { Env, Tenant } from "../types";

const styles = `
  body { font-family: system-ui, sans-serif; max-width: 520px; margin: 2rem auto; padding: 0 1rem; color: #111; }
  h1 { font-size: 1.5rem; }
  label { display: block; margin-top: 1rem; font-weight: 600; font-size: 0.875rem; }
  input, select { width: 100%; padding: 0.6rem; margin-top: 0.25rem; border: 1px solid #ccc; border-radius: 6px; box-sizing: border-box; }
  button { margin-top: 1.5rem; width: 100%; padding: 0.75rem; background: #1e3a8a; color: #fff; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; }
  button:disabled { opacity: 0.6; }
  .muted { color: #666; font-size: 0.875rem; }
  .error { color: #b91c1c; font-size: 0.875rem; margin-top: 0.5rem; }
  .plan { border: 1px solid #e5e7eb; border-radius: 8px; padding: 0.75rem; margin-top: 0.5rem; }
  .progress { margin: 0.5rem 0; padding: 0.5rem; background: #f3f4f6; border-radius: 4px; font-size: 0.875rem; }
  .done { color: #15803d; }
  .failed { color: #b91c1c; }
`;

export function signupPageHtml(_env: Env) {
  const planOptions = Object.values(PLANS)
    .map(
      (p) =>
        `<option value="${p.id}">${p.name} — ${formatUgx(p.monthlyAmountUgx)}/mo (after 30-day trial)</option>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Start your school website — SamaBrains</title>
  <style>${styles}</style>
</head>
<body>
  <h1>Start your 30-day free trial</h1>
  <p class="muted">Your school site goes live in minutes. Billing in UGX via Pesapal after trial.</p>
  <form id="signup-form">
    <label>School name<input name="school_name" required placeholder="Green Valley Academy" /></label>
    <label>Site address (optional)<input name="slug" placeholder="green-valley" /><span class="muted"> .samabrains.com</span></label>
    <label>Admin email<input name="admin_email" type="email" required /></label>
    <label>Phone (+256)<input name="admin_phone" placeholder="+256700000000" /></label>
    <label>Plan<select name="plan">${planOptions}</select></label>
    <p id="error" class="error" hidden></p>
    <button type="submit" id="submit">Create my school site</button>
  </form>
  <script>
    document.getElementById('signup-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('submit');
      const err = document.getElementById('error');
      err.hidden = true;
      btn.disabled = true;
      const fd = new FormData(e.target);
      const body = Object.fromEntries(fd.entries());
      try {
        const res = await fetch('/api/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Signup failed');
        window.location.href = data.setup_url;
      } catch (ex) {
        err.textContent = ex.message;
        err.hidden = false;
        btn.disabled = false;
      }
    });
  </script>
</body>
</html>`;
}

export function setupPageHtml(
  tenant: Pick<Tenant, "id" | "school_name" | "status" | "production_url">,
  jobs: { step: string; status: string; error: string | null }[],
  env: Env
) {
  const jobsHtml =
    jobs.length === 0
      ? '<p class="muted">Starting provisioning…</p>'
      : jobs
          .map(
            (j) =>
              `<div class="progress ${j.status === "done" ? "done" : j.status === "failed" ? "failed" : ""}">${j.step}: ${j.status}${j.error ? " — " + j.error : ""}</div>`
          )
          .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Setting up ${tenant.school_name}</title>
  <style>${styles}</style>
</head>
<body>
  <h1>Setting up ${tenant.school_name}</h1>
  <p class="muted">Status: <strong>${tenant.status}</strong></p>
  ${jobsHtml}
  <p id="url" class="muted">${tenant.production_url}</p>
  <script>
    const tenantId = ${JSON.stringify(tenant.id)};
    async function poll() {
      const res = await fetch('/api/setup/' + tenantId);
      const data = await res.json();
      if (data.tenant?.status === 'trialing' || data.tenant?.status === 'active') {
        document.body.innerHTML += '<p class="done">Ready! Check your email for admin login link.</p>';
        return;
      }
      setTimeout(() => location.reload(), 5000);
    }
    poll();
  </script>
</body>
</html>`;
}

export function subscribePageHtml(env: Env) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Subscribe — SamaBrains</title>
  <style>${styles}</style>
</head>
<body>
  <h1>Subscribe your school</h1>
  <p class="muted">Pay monthly in UGX via Pesapal (mobile money or card).</p>
  <button id="pay">Continue to Pesapal</button>
  <p id="error" class="error" hidden></p>
  <script>
    const params = new URLSearchParams(location.search);
    const tenantId = params.get('tenant');
    if (!tenantId) document.getElementById('error').textContent = 'Missing tenant id';
    document.getElementById('pay').onclick = async () => {
      const err = document.getElementById('error');
      try {
        const res = await fetch('/api/billing/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenant_id: tenantId })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');
        location.href = data.redirect_url;
      } catch (ex) {
        err.textContent = ex.message;
        err.hidden = false;
      }
    };
  </script>
</body>
</html>`;
}
