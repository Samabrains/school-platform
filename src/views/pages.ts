import { formatUgx, PLANS } from "../config/plans";
import type { Env, Tenant } from "../types";

const NAV_LINKS = [
  { id: "signup", href: "/signup", label: "Sign up" },
  { id: "pricing", href: "/pricing", label: "Pricing" },
  { id: "subscribe", href: "/subscribe", label: "Subscribe" },
  { id: "ops", href: "/ops", label: "Staff" },
] as const;

function platformNav(active: string) {
  const links = NAV_LINKS.map(
    (l) =>
      `<a href="${l.href}" class="nav-link${l.id === active ? " active" : ""}">${l.label}</a>`
  ).join("");
  return `<header class="site-header">
  <a href="/signup" class="brand">SamaBrains <span>School Platform</span></a>
  <nav class="site-nav" aria-label="Main">${links}</nav>
</header>`;
}

function pageShell(title: string, active: string, body: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>${styles}</style>
</head>
<body>
  ${platformNav(active)}
  <main class="page-main">${body}</main>
</body>
</html>`;
}

const styles = `
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 0; color: #111; background: #f8fafc; }
  .site-header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.85rem 1.25rem; background: #fff; border-bottom: 1px solid #e5e7eb; }
  .brand { font-weight: 700; font-size: 1rem; color: #1e3a8a; text-decoration: none; }
  .brand span { font-weight: 500; color: #64748b; font-size: 0.875rem; margin-left: 0.35rem; }
  .site-nav { display: flex; flex-wrap: wrap; gap: 0.25rem 0.5rem; }
  .nav-link { padding: 0.4rem 0.75rem; font-size: 0.875rem; font-weight: 500; color: #475569; text-decoration: none; border-radius: 6px; }
  .nav-link:hover { background: #f1f5f9; color: #1e3a8a; }
  .nav-link.active { background: #1e3a8a; color: #fff; }
  .page-main { max-width: 520px; margin: 0 auto; padding: 2rem 1rem 3rem; }
  .page-main.wide { max-width: 640px; }
  h1 { font-size: 1.5rem; margin-top: 0; }
  label { display: block; margin-top: 1rem; font-weight: 600; font-size: 0.875rem; }
  input, select { width: 100%; padding: 0.6rem; margin-top: 0.25rem; border: 1px solid #ccc; border-radius: 6px; box-sizing: border-box; background: #fff; }
  button, .btn { margin-top: 1.5rem; padding: 0.75rem 1rem; background: #1e3a8a; color: #fff; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; text-decoration: none; display: inline-block; font-size: 0.875rem; }
  button { width: 100%; }
  button:disabled { opacity: 0.6; }
  .muted { color: #666; font-size: 0.875rem; }
  .error { color: #b91c1c; font-size: 0.875rem; margin-top: 0.5rem; }
  .plan-card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 1rem 1.25rem; margin-top: 1rem; background: #fff; }
  .plan-card h2 { font-size: 1.1rem; margin: 0 0 0.25rem; }
  .plan-card .price { font-size: 1.25rem; font-weight: 700; color: #1e3a8a; margin: 0.5rem 0; }
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

  return pageShell(
    "Start your school website — SamaBrains",
    "signup",
    `<h1>Start your 30-day free trial</h1>
  <p class="muted">Your school site goes live in minutes. Billing in UGX via Pesapal after trial.</p>
  <form id="signup-form">
    <label>School name<input name="school_name" required placeholder="Green Valley Academy" /></label>
    <label>Site address (optional)<input name="slug" placeholder="green-valley" pattern="[a-z0-9-]+" /><span class="muted"> Short name for your school website</span></label>
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
      if (body.slug) {
        body.slug = body.slug.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
      }
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
  </script>`
  );
}

export function pricingPageHtml(_env: Env) {
  const cards = Object.values(PLANS)
    .map(
      (p) => `<article class="plan-card">
    <h2>${p.name}</h2>
    <p class="price">${formatUgx(p.monthlyAmountUgx)}<span class="muted"> / month after trial</span></p>
    <p class="muted">30-day free trial · Pay with Pesapal (MTN, Airtel, card)</p>
    <a class="btn" href="/signup" style="margin-top:1rem;width:100%;text-align:center">Start free trial</a>
  </article>`
    )
    .join("");

  return pageShell(
    "Pricing — SamaBrains School Platform",
    "pricing",
    `<h1>Simple pricing in UGX</h1>
  <p class="muted">Every plan includes a live school website, parent hub, and admin dashboard. No payment required at signup.</p>
  ${cards}
  <p class="muted" style="margin-top:1.5rem">Already have a school? <a href="/subscribe">Subscribe or renew billing</a>.</p>`
  );
}

const SETUP_STEP_LABELS: Record<string, string> = {
  d1: "School records",
  r2: "Photos & documents",
  vectorize: "Smart search",
  pages: "Your website address",
  secrets: "School settings",
  migrate: "Preparing your data",
  github: "Connecting your site",
  deploy: "Building your website",
  bootstrap: "Adding welcome content",
  health: "Final checks",
};

const JOB_STATUS_LABELS: Record<string, string> = {
  done: "Complete",
  running: "In progress…",
  failed: "Couldn't finish",
};

const TENANT_STATUS_LABELS: Record<string, string> = {
  provisioning: "Setting up your school",
  trialing: "Ready",
  active: "Live",
  draft: "Setup paused",
};

/** Hide infrastructure details from end users. */
function friendlySetupError(error: string | null): string {
  if (!error) return "";
  const lower = error.toLowerCase();
  if (
    lower.includes("cloudflare") ||
    lower.includes("github") ||
    lower.includes("git") ||
    lower.includes("d1") ||
    lower.includes("vectorize") ||
    lower.includes("pages/projects") ||
    lower.includes("api/")
  ) {
    return "Something went wrong while setting up your site. Please try again.";
  }
  if (lower.includes("slug") || lower.includes("site address")) {
    return error;
  }
  return "Something went wrong. Please try again.";
}

function formatJobLine(
  step: string,
  status: string,
  error: string | null
): string {
  const label = SETUP_STEP_LABELS[step] ?? "Setting up";
  const statusLabel = JOB_STATUS_LABELS[status] ?? status;
  const cls =
    status === "done" ? "done" : status === "failed" ? "failed" : "";
  const err =
    status === "failed" && error
      ? ` — ${friendlySetupError(error)}`
      : "";
  return `<div class="progress ${cls}">${label}: ${statusLabel}${err}</div>`;
}

export function setupPageHtml(
  tenant: Pick<
    Tenant,
    "id" | "school_name" | "status" | "production_url" | "admin_email"
  >,
  jobs: { step: string; status: string; error: string | null }[],
  _env: Env
) {
  const statusLabel =
    TENANT_STATUS_LABELS[tenant.status] ?? "Setting up your school";

  const jobsHtml =
    jobs.length === 0
      ? '<p class="muted" id="jobs">Getting started…</p>'
      : `<div id="jobs">${jobs
          .map((j) => formatJobLine(j.step, j.status, j.error))
          .join("")}</div>`;

  const email = tenant.admin_email || "your email";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Setting up ${tenant.school_name}</title>
  <style>${styles}</style>
</head>
<body>
  ${platformNav("signup")}
  <main class="page-main">
  <h1>Setting up ${tenant.school_name}</h1>
  <p class="muted">Status: <strong id="status">${statusLabel}</strong></p>
  ${jobsHtml}
  <p id="url" class="muted" hidden></p>
  <p class="muted" id="bg-note" hidden>
    This usually takes 3–8 minutes. <strong>You can close this tab</strong> — we will email
    <strong>${email}</strong> when your school website is ready.
  </p>
  <p class="done" id="done" hidden>Your school website is ready! Check your email for the admin login link.</p>
  <p class="failed" id="failed" hidden>
    We couldn't finish setting up your site. Use a site address with letters, numbers, and hyphens only (e.g. green-valley), then
    <a href="/signup">try again</a>.
  </p>
  <p class="muted" id="retry-wrap" hidden><button type="button" id="retry">Try again</button></p>
  <script>
    const tenantId = ${JSON.stringify(tenant.id)};
    const stepLabels = ${JSON.stringify(SETUP_STEP_LABELS)};
    const jobStatusLabels = ${JSON.stringify(JOB_STATUS_LABELS)};
    const tenantStatusLabels = ${JSON.stringify(TENANT_STATUS_LABELS)};
    let polls = 0;

    function friendlyError(msg) {
      if (!msg) return '';
      const lower = String(msg).toLowerCase();
      if (lower.includes('cloudflare') || lower.includes('github') || lower.includes('git') ||
          lower.includes('d1') || lower.includes('vectorize') || lower.includes('pages/projects') ||
          lower.includes('api/')) {
        return 'Something went wrong while setting up your site. Please try again.';
      }
      if (lower.includes('slug') || lower.includes('site address')) return msg;
      return 'Something went wrong. Please try again.';
    }

    function renderJobs(jobs) {
      const el = document.getElementById('jobs');
      if (!el || !jobs?.length) return;
      el.innerHTML = jobs.map(j => {
        const label = stepLabels[j.step] || 'Setting up';
        const statusLabel = jobStatusLabels[j.status] || j.status;
        const cls = j.status === 'done' ? 'done' : j.status === 'failed' ? 'failed' : '';
        const err = j.status === 'failed' && j.error ? ' — ' + friendlyError(j.error) : '';
        return '<div class="progress ' + cls + '">' + label + ': ' + statusLabel + err + '</div>';
      }).join('');
    }

    async function poll() {
      polls++;
      try {
        const res = await fetch('/api/setup/' + tenantId);
        const data = await res.json();
        if (data.tenant?.status) {
          const st = document.getElementById('status');
          if (st) st.textContent = tenantStatusLabels[data.tenant.status] || 'Setting up your school';
        }
        if (data.jobs) renderJobs(data.jobs);

        const building = data.jobs?.some(j =>
          ['deploy', 'bootstrap', 'health'].includes(j.step) &&
          (j.status === 'running' || j.status === 'done')
        );
        if (building) document.getElementById('bg-note').hidden = false;

        if (data.tenant?.status === 'trialing' || data.tenant?.status === 'active') {
          const urlEl = document.getElementById('url');
          if (urlEl && data.tenant.production_url) {
            urlEl.textContent = 'Your site: ' + data.tenant.production_url;
            urlEl.hidden = false;
          }
          document.getElementById('done').hidden = false;
          document.getElementById('retry-wrap').hidden = true;
          return;
        }
        if (data.tenant?.status === 'draft') {
          document.getElementById('failed').hidden = false;
          return;
        }

        const stuck = polls >= 12 && data.jobs?.some(j => j.status === 'running');
        if (stuck) document.getElementById('retry-wrap').hidden = false;
      } catch (_) {}

      setTimeout(poll, 5000);
    }

    document.getElementById('retry')?.addEventListener('click', async () => {
      await fetch('/api/setup/' + tenantId + '/retry', { method: 'POST' });
      polls = 0;
      document.getElementById('retry-wrap').hidden = true;
      document.getElementById('failed').hidden = true;
      poll();
    });

    poll();
  </script>
  </main>
</body>
</html>`;
}

export function subscribePageHtml(env: Env) {
  return pageShell(
    "Subscribe — SamaBrains",
    "subscribe",
    `<h1>Subscribe your school</h1>
  <p class="muted">Pay monthly in UGX via Pesapal (mobile money or card).</p>
  <label>School tenant ID<input id="tenant-input" placeholder="ten_… or paste from your billing email" /></label>
  <p class="muted">Use the link from your trial reminder email, or enter your tenant ID above.</p>
  <button id="pay">Continue to Pesapal</button>
  <p id="error" class="error" hidden></p>
  <script>
    const params = new URLSearchParams(location.search);
    const input = document.getElementById('tenant-input');
    if (params.get('tenant')) input.value = params.get('tenant');
    document.getElementById('pay').onclick = async () => {
      const err = document.getElementById('error');
      const tenantId = input.value.trim() || params.get('tenant');
      if (!tenantId) {
        err.textContent = 'Enter your tenant ID or open the link from your billing email.';
        err.hidden = false;
        return;
      }
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
  </script>`
  );
}
