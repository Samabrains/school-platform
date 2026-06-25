import { formatUgx, PLANS } from "../config/plans";
import type { Env, Tenant } from "../types";

const NAV_LINKS = [
  { id: "home", href: "/", label: "Home" },
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
  <a href="/" class="brand">SamaBrains <span>School Platform</span></a>
  <nav class="site-nav" aria-label="Main">${links}</nav>
</header>`;
}

function pageShell(title: string, active: string, body: string, width?: "wide") {
  const mainClass = width === "wide" ? "page-main wide" : "page-main";
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
  <main class="${mainClass}">${body}</main>
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
  .page-main.wide { max-width: 720px; }
  .hero { text-align: center; padding: 1rem 0 2rem; }
  .hero h1 { font-size: 2rem; line-height: 1.2; }
  .hero .lead { font-size: 1.05rem; color: #475569; max-width: 36rem; margin: 0.75rem auto 1.5rem; }
  .hero-cta { display: flex; flex-wrap: wrap; gap: 0.75rem; justify-content: center; }
  .hero-cta .btn-secondary { background: #fff; color: #1e3a8a; border: 1px solid #cbd5e1; }
  .features { display: grid; gap: 1rem; margin: 2rem 0; }
  @media (min-width: 560px) { .features { grid-template-columns: 1fr 1fr; } }
  .feature { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 1rem 1.25rem; }
  .feature h3 { margin: 0 0 0.35rem; font-size: 1rem; }
  .slug-status { font-size: 0.8rem; margin-top: 0.35rem; }
  .slug-ok { color: #15803d; }
  .slug-bad { color: #b91c1c; }
  .color-row { display: flex; gap: 1rem; margin-top: 0.25rem; }
  .color-row label { flex: 1; margin-top: 0; font-weight: 500; font-size: 0.8rem; }
  .color-row input[type=color] { height: 2.5rem; padding: 0.15rem; }
  .legal { font-size: 0.875rem; line-height: 1.6; }
  .legal h2 { font-size: 1.1rem; margin-top: 1.5rem; }
  .plan-features { margin: 0.75rem 0 0; padding-left: 1.1rem; font-size: 0.875rem; color: #475569; }
  .checkbox-label { display: flex; gap: 0.5rem; align-items: flex-start; font-weight: 400; margin-top: 1rem; }
  .checkbox-label input { width: auto; margin-top: 0.2rem; }
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

export function homePageHtml(_env: Env) {
  return pageShell(
    "SamaBrains — School websites in minutes",
    "home",
    `<div class="hero">
  <h1>Your school website, live in minutes</h1>
  <p class="lead">Beautiful sites with news, parent hub, digital forms, and an AI handbook assistant. 30-day free trial — pay in UGX after.</p>
  <div class="hero-cta">
    <a class="btn" href="/signup" style="margin-top:0">Start free trial</a>
    <a class="btn btn-secondary" href="/pricing" style="margin-top:0">View pricing</a>
  </div>
</div>
<section class="features" aria-label="Features">
  <article class="feature"><h3>Live in minutes</h3><p class="muted">Sign up and we provision your site, database, and admin access automatically.</p></article>
  <article class="feature"><h3>Parent hub</h3><p class="muted">Forms, admissions, and secure parent login — no extra plugins.</p></article>
  <article class="feature"><h3>AI handbook</h3><p class="muted">Parents ask questions; answers come from your school policies.</p></article>
  <article class="feature"><h3>UGX billing</h3><p class="muted">Subscribe via Pesapal — MTN, Airtel, or card after your trial.</p></article>
</section>
<p class="muted" style="text-align:center">Already have a school? <a href="/subscribe">Subscribe or renew</a>.</p>`,
    "wide"
  );
}

export function termsPageHtml(_env: Env) {
  return pageShell(
    "Terms of Service — SamaBrains",
    "signup",
    `<h1>Terms of Service</h1>
<div class="legal">
  <p>By creating a school site on SamaBrains School Platform you agree to use the service for lawful educational purposes.</p>
  <h2>Trial & billing</h2>
  <p>New schools receive a 30-day free trial. After the trial, monthly fees apply per your selected plan, billed in UGX via Pesapal unless otherwise agreed.</p>
  <h2>Your content</h2>
  <p>You retain ownership of school content you upload. You grant SamaBrains permission to host and display it as part of the service.</p>
  <h2>Acceptable use</h2>
  <p>Do not upload unlawful content, malware, or material that infringes others' rights. We may suspend sites that violate these terms.</p>
  <h2>Contact</h2>
  <p>Questions: <a href="mailto:support@samabrains.com">support@samabrains.com</a></p>
</div>`
  );
}

export function privacyPageHtml(_env: Env) {
  return pageShell(
    "Privacy Policy — SamaBrains",
    "signup",
    `<h1>Privacy Policy</h1>
<div class="legal">
  <p>We collect school name, admin contact details, and usage data needed to operate your site and billing.</p>
  <h2>What we store</h2>
  <p>Account email, phone (optional), site content you provide, and technical logs for security and support.</p>
  <h2>Email</h2>
  <p>Transactional email (welcome, billing reminders) is sent via Brevo. We do not sell your data.</p>
  <h2>Data location</h2>
  <p>School sites and platform data are hosted on Cloudflare infrastructure.</p>
  <h2>Contact</h2>
  <p>Privacy requests: <a href="mailto:support@samabrains.com">support@samabrains.com</a></p>
</div>`
  );
}

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
    <label>School name<input name="school_name" id="school_name" required placeholder="Green Valley Academy" /></label>
    <label>Site address (optional)
      <input name="slug" id="slug" placeholder="green-valley" pattern="[a-z0-9-]+" autocomplete="off" />
      <span class="muted"> Short name for your school website</span>
      <p id="slug-status" class="slug-status muted" hidden></p>
    </label>
    <label>Tagline (optional)<input name="tagline" placeholder="Excellence in Every Classroom" maxlength="120" /></label>
    <label>Brand colors</label>
    <div class="color-row">
      <label>Primary<input name="primary_color" type="color" value="#1E3A8A" /></label>
      <label>Accent<input name="secondary_color" type="color" value="#F59E0B" /></label>
    </div>
    <label>Admin email<input name="admin_email" type="email" required /></label>
    <label>Phone (+256)<input name="admin_phone" placeholder="+256700000000" /></label>
    <label>Plan<select name="plan">${planOptions}</select></label>
    <label class="checkbox-label">
      <input name="accept_terms" type="checkbox" value="yes" required />
      <span>I agree to the <a href="/terms" target="_blank">Terms of Service</a> and <a href="/privacy" target="_blank">Privacy Policy</a></span>
    </label>
    <p id="error" class="error" hidden></p>
    <button type="submit" id="submit">Create my school site</button>
  </form>
  <script>
    let slugTimer;
    const slugInput = document.getElementById('slug');
    const schoolInput = document.getElementById('school_name');
    const slugStatus = document.getElementById('slug-status');

    function normalizeSlug(s) {
      return String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    }

    async function checkSlug() {
      const raw = slugInput.value.trim() || schoolInput.value.trim();
      const slug = normalizeSlug(raw);
      if (!slug || slug.length < 3) {
        slugStatus.hidden = true;
        return;
      }
      slugStatus.hidden = false;
      slugStatus.textContent = 'Checking…';
      slugStatus.className = 'slug-status muted';
      try {
        const res = await fetch('/api/signup/check-slug?slug=' + encodeURIComponent(slug));
        const data = await res.json();
        if (data.available) {
          slugStatus.textContent = data.slug + ' is available';
          slugStatus.className = 'slug-status slug-ok';
        } else {
          slugStatus.textContent = data.error || (data.slug + ' is taken');
          slugStatus.className = 'slug-status slug-bad';
        }
      } catch (_) {
        slugStatus.hidden = true;
      }
    }

    slugInput.addEventListener('input', () => {
      clearTimeout(slugTimer);
      slugTimer = setTimeout(checkSlug, 400);
    });
    schoolInput.addEventListener('blur', () => {
      if (!slugInput.value.trim()) checkSlug();
    });

    document.getElementById('signup-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('submit');
      const err = document.getElementById('error');
      err.hidden = true;
      btn.disabled = true;
      const fd = new FormData(e.target);
      const body = Object.fromEntries(fd.entries());
      body.accept_terms = fd.get('accept_terms') === 'yes';
      if (body.slug) {
        body.slug = normalizeSlug(body.slug);
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
      (p) => {
        const features = p.features
          .map((f) => `<li>${f}</li>`)
          .join("");
        return `<article class="plan-card">
    <h2>${p.name}</h2>
    <p class="price">${formatUgx(p.monthlyAmountUgx)}<span class="muted"> / month after trial</span></p>
    <p class="muted">30-day free trial · Pay with Pesapal (MTN, Airtel, card)</p>
    <ul class="plan-features">${features}</ul>
    <a class="btn" href="/signup" style="margin-top:1rem;width:100%;text-align:center">Start free trial</a>
  </article>`;
      }
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
  ${platformNav("home")}
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
