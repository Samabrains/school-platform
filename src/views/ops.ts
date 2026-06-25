import type { Env } from "../types";

const opsStyles = `
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, sans-serif; margin: 0; background: #f8fafc; color: #0f172a; }
  .wrap { max-width: 1100px; margin: 0 auto; padding: 1.5rem 1rem 3rem; }
  h1 { font-size: 1.35rem; margin: 0 0 0.25rem; }
  .sub { color: #64748b; font-size: 0.875rem; margin-bottom: 1.5rem; }
  .login-box { max-width: 400px; margin: 4rem auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 2rem; }
  .login-box input { width: 100%; padding: 0.65rem; margin-top: 0.5rem; border: 1px solid #cbd5e1; border-radius: 8px; }
  .login-box button { width: 100%; margin-top: 1rem; padding: 0.7rem; background: #1e3a8a; color: #fff; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; }
  .metrics { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 0.75rem; margin-bottom: 1.5rem; }
  .metric { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 1rem; }
  .metric .val { font-size: 1.5rem; font-weight: 700; }
  .metric .lbl { font-size: 0.75rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.03em; }
  .toolbar { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem; align-items: center; }
  .toolbar input, .toolbar select { padding: 0.45rem 0.6rem; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.875rem; }
  .toolbar button, .btn { padding: 0.4rem 0.75rem; font-size: 0.8rem; border-radius: 6px; border: 1px solid #cbd5e1; background: #fff; cursor: pointer; }
  .btn-primary { background: #1e3a8a; color: #fff; border-color: #1e3a8a; }
  .btn-danger { background: #fef2f2; color: #b91c1c; border-color: #fecaca; }
  .btn-sm { padding: 0.25rem 0.5rem; font-size: 0.75rem; }
  table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; font-size: 0.875rem; }
  th, td { padding: 0.6rem 0.75rem; text-align: left; border-bottom: 1px solid #f1f5f9; }
  th { background: #f8fafc; font-weight: 600; font-size: 0.75rem; color: #64748b; text-transform: uppercase; }
  tr:hover td { background: #f8fafc; }
  tr[data-slug] { cursor: pointer; }
  .badge { display: inline-block; padding: 0.15rem 0.45rem; border-radius: 999px; font-size: 0.7rem; font-weight: 600; }
  .badge-active { background: #dcfce7; color: #166534; }
  .badge-trialing { background: #dbeafe; color: #1e40af; }
  .badge-provisioning { background: #fef3c7; color: #92400e; }
  .badge-suspended { background: #fee2e2; color: #991b1b; }
  .badge-draft { background: #f1f5f9; color: #475569; }
  .panel { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 1.25rem; margin-top: 1.5rem; }
  .panel h2 { font-size: 1.1rem; margin: 0 0 1rem; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem 1.5rem; font-size: 0.875rem; }
  .grid2 dt { color: #64748b; margin: 0; }
  .grid2 dd { margin: 0 0 0.5rem; font-weight: 500; }
  .actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 1rem 0; }
  .job { padding: 0.35rem 0; font-size: 0.8rem; border-bottom: 1px solid #f1f5f9; }
  .job-ok { color: #15803d; }
  .job-fail { color: #b91c1c; }
  .hidden { display: none !important; }
  .err { color: #b91c1c; font-size: 0.875rem; }
  .tabs { display: flex; gap: 0.25rem; margin-bottom: 1rem; }
  .tab { padding: 0.5rem 1rem; border: none; background: transparent; cursor: pointer; border-bottom: 2px solid transparent; color: #64748b; }
  .tab.active { color: #1e3a8a; border-bottom-color: #1e3a8a; font-weight: 600; }
  a.link { color: #1e40af; }
  #toast { position: fixed; bottom: 1rem; right: 1rem; background: #0f172a; color: #fff; padding: 0.6rem 1rem; border-radius: 8px; font-size: 0.875rem; opacity: 0; transition: opacity 0.2s; pointer-events: none; z-index: 99; }
  #toast.show { opacity: 1; }
`;

export function opsDashboardHtml(_env: Env) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Ops — SamaBrains School Platform</title>
  <style>${opsStyles}</style>
</head>
<body>
  <div id="login-view" class="login-box">
    <h1>SamaBrains Ops</h1>
    <p class="sub">Internal dashboard — API secret required</p>
    <label>Platform API secret<input type="password" id="api-secret" autocomplete="current-password" /></label>
    <p id="login-err" class="err hidden"></p>
    <button type="button" id="login-btn">Sign in</button>
  </div>

  <div id="app" class="wrap hidden">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:0.5rem;">
      <div>
        <h1>SamaBrains Ops</h1>
        <p class="sub">Tenants · billing · provisioning</p>
      </div>
      <button type="button" class="btn btn-sm" id="logout-btn">Sign out</button>
    </div>

    <div class="tabs">
      <button type="button" class="tab active" data-tab="tenants">Tenants</button>
      <button type="button" class="tab" data-tab="deployments">Deployments</button>
      <button type="button" class="tab" data-tab="audit">Audit log</button>
    </div>

    <div id="tab-tenants">
      <div class="metrics" id="metrics"></div>
      <div class="toolbar">
        <select id="filter-status">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="trialing">Trialing</option>
          <option value="provisioning">Provisioning</option>
          <option value="suspended">Suspended</option>
          <option value="draft">Draft</option>
        </select>
        <input type="search" id="search" placeholder="Search slug, name, email…" style="min-width:200px" />
        <button type="button" class="btn" id="refresh-btn">Refresh</button>
        <button type="button" class="btn btn-sm" id="health-sweep-btn">Health sweep all</button>
      </div>
      <table>
        <thead>
          <tr>
            <th>School</th>
            <th>Status</th>
            <th>Billing</th>
            <th>Plan</th>
            <th>Trial</th>
            <th>Site</th>
          </tr>
        </thead>
        <tbody id="tenant-rows"></tbody>
      </table>
      <div id="detail-panel" class="panel hidden"></div>
    </div>

    <div id="tab-deployments" class="hidden">
      <table>
        <thead>
          <tr><th>Commit</th><th>Status</th><th>Tenants</th><th>Started</th></tr>
        </thead>
        <tbody id="deploy-rows"></tbody>
      </table>
    </div>

    <div id="tab-audit" class="hidden">
      <table>
        <thead>
          <tr><th>When</th><th>Action</th><th>Tenant</th><th>Detail</th></tr>
        </thead>
        <tbody id="audit-rows"></tbody>
      </table>
    </div>
  </div>

  <div id="toast"></div>

  <script>
    const TOKEN_KEY = 'ops_api_secret';

    function token() { return sessionStorage.getItem(TOKEN_KEY); }
    function headers() {
      return { Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' };
    }
    function toast(msg) {
      const el = document.getElementById('toast');
      el.textContent = msg;
      el.classList.add('show');
      setTimeout(() => el.classList.remove('show'), 3000);
    }
    function fmtDate(unix) {
      if (!unix) return '—';
      return new Date(unix * 1000).toLocaleString('en-UG', { dateStyle: 'medium', timeStyle: 'short' });
    }
    function fmtUgx(n) {
      return 'UGX ' + Number(n).toLocaleString('en-UG');
    }
    function badge(status) {
      const cls = 'badge badge-' + (status || 'draft');
      return '<span class="' + cls + '">' + status + '</span>';
    }

    async function api(path, opts = {}) {
      const res = await fetch(path, { ...opts, headers: { ...headers(), ...(opts.headers || {}) } });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        sessionStorage.removeItem(TOKEN_KEY);
        showLogin();
        throw new Error('Session expired');
      }
      if (!res.ok) throw new Error(data.error || res.statusText);
      return data;
    }

    function showLogin() {
      document.getElementById('login-view').classList.remove('hidden');
      document.getElementById('app').classList.add('hidden');
    }
    function showApp() {
      document.getElementById('login-view').classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');
    }

    async function loadMetrics() {
      const m = await api('/api/ops/metrics');
      document.getElementById('metrics').innerHTML = [
        ['Active', m.tenants.active],
        ['Trialing', m.tenants.trialing],
        ['Provisioning', m.tenants.provisioning],
        ['Suspended', m.tenants.suspended],
        ['MRR', fmtUgx(m.mrr_ugx)],
        ['Trial ≤5d', m.trial_expiring_5d],
      ].map(([lbl, val]) =>
        '<div class="metric"><div class="val">' + val + '</div><div class="lbl">' + lbl + '</div></div>'
      ).join('');
    }

    async function loadTenants() {
      const status = document.getElementById('filter-status').value;
      const q = document.getElementById('search').value.trim();
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (q) params.set('q', q);
      const { tenants } = await api('/api/ops/tenants?' + params);
      const tbody = document.getElementById('tenant-rows');
      tbody.innerHTML = tenants.map(t => '<tr data-slug="' + t.slug + '">' +
        '<td><strong>' + esc(t.school_name) + '</strong><br><span class="sub">' + esc(t.slug) + '</span></td>' +
        '<td>' + badge(t.status) + '</td>' +
        '<td>' + esc(t.billing_status) + '</td>' +
        '<td>' + esc(t.plan) + '</td>' +
        '<td>' + (t.trial_days_left != null ? t.trial_days_left + 'd' : '—') + '</td>' +
        '<td><a class="link" href="' + esc(t.production_url) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">Open</a></td>' +
      '</tr>').join('') || '<tr><td colspan="6">No tenants</td></tr>';
      tbody.querySelectorAll('tr[data-slug]').forEach(row => {
        row.addEventListener('click', () => loadDetail(row.dataset.slug));
      });
    }

    function esc(s) {
      return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
    }

    async function loadDetail(slug) {
      const panel = document.getElementById('detail-panel');
      panel.classList.remove('hidden');
      panel.innerHTML = '<p class="sub">Loading…</p>';
      const data = await api('/api/ops/tenants/' + encodeURIComponent(slug));
      const t = data.tenant;
      const jobs = data.provisioning_jobs || [];
      const events = data.billing_events || [];
      panel.innerHTML =
        '<h2>' + esc(t.school_name) + ' <span class="sub">(' + esc(t.slug) + ')</span></h2>' +
        '<dl class="grid2">' +
          '<dt>Status</dt><dd>' + badge(t.status) + ' · ' + esc(t.billing_status) + '</dd>' +
          '<dt>Admin</dt><dd>' + esc(t.admin_email) + '</dd>' +
          '<dt>Plan</dt><dd>' + esc(t.plan) + '</dd>' +
          '<dt>Trial ends</dt><dd>' + fmtDate(t.trial_ends_at) + (t.trial_days_left != null ? ' (' + t.trial_days_left + 'd left)' : '') + '</dd>' +
          '<dt>Site</dt><dd><a class="link" href="' + esc(t.production_url) + '" target="_blank">' + esc(t.production_url) + '</a></dd>' +
          '<dt>Template</dt><dd>' + (t.template_version ? esc(t.template_version.slice(0, 8)) : '—') + '</dd>' +
          '<dt>D1</dt><dd style="font-size:0.75rem;word-break:break-all">' + esc(t.d1_database_id) + '</dd>' +
          '<dt>Pesapal tracking</dt><dd>' + esc(t.pesapal_order_tracking_id || '—') + '</dd>' +
        '</dl>' +
        '<div class="actions">' +
          '<button class="btn btn-primary btn-sm" data-act="health">Health check</button>' +
          '<button class="btn btn-sm" data-act="bindings">Re-apply bindings</button>' +
          '<button class="btn btn-sm" data-act="redeploy">Redeploy site</button>' +
          '<button class="btn btn-sm" data-act="retry">Retry provision</button>' +
          '<button class="btn btn-sm" data-act="activate">Activate</button>' +
          '<button class="btn btn-danger btn-sm" data-act="suspend">Suspend</button>' +
          '<button class="btn btn-sm" data-act="pesapal">Pesapal lookup</button>' +
          '<button class="btn btn-danger btn-sm" data-act="delete">Delete tenant</button>' +
        '</div>' +
        '<div id="delete-panel" class="hidden" style="margin-top:1rem;padding:1rem;border:1px solid #fecaca;border-radius:8px;background:#fef2f2">' +
          '<p style="margin:0 0 0.5rem;font-size:0.875rem"><strong>Permanent delete</strong> — removes Pages, D1, R2, Vectorize, and all platform records.</p>' +
          '<label style="font-size:0.8rem">Type <code>' + esc(t.slug) + '</code> to confirm<input id="delete-confirm" style="margin-top:0.35rem" autocomplete="off" /></label>' +
          '<div style="display:flex;gap:0.5rem;margin-top:0.75rem">' +
            '<button class="btn btn-danger btn-sm" id="delete-go" type="button">Delete forever</button>' +
            '<button class="btn btn-sm" id="delete-cancel" type="button">Cancel</button>' +
          '</div>' +
        '</div>' +
        '<div id="pesapal-result"></div>' +
        '<h3 style="font-size:0.95rem;margin:1rem 0 0.5rem">Provisioning jobs</h3>' +
        (jobs.length ? jobs.map(j =>
          '<div class="job ' + (j.status === 'done' ? 'job-ok' : j.status === 'failed' ? 'job-fail' : '') + '">' +
          esc(j.step) + ': ' + esc(j.status) + (j.error ? ' — ' + esc(j.error.slice(0, 80)) : '') +
          '</div>').join('') : '<p class="sub">None</p>') +
        '<h3 style="font-size:0.95rem;margin:1rem 0 0.5rem">Billing events</h3>' +
        (events.length ? '<table><thead><tr><th>Date</th><th>Type</th><th>Status</th><th>Amount</th></tr></thead><tbody>' +
          events.map(e => '<tr><td>' + fmtDate(e.created_at) + '</td><td>' + esc(e.notification_type) + '</td><td>' + esc(e.payment_status) + '</td><td>' + esc(e.amount) + ' ' + esc(e.currency) + '</td></tr>').join('') +
          '</tbody></table>' : '<p class="sub">No billing events</p>');

      panel.querySelectorAll('[data-act]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const act = btn.dataset.act;
          try {
            btn.disabled = true;
            if (act === 'health') {
              const r = await api('/api/ops/tenants/' + slug + '/health', { method: 'POST' });
              toast(r.ok ? 'Health OK' : 'Health failed');
            } else if (act === 'bindings') {
              await api('/api/ops/tenants/' + slug + '/bindings', { method: 'POST' });
              toast('Bindings applied');
            } else if (act === 'redeploy') {
              if (!confirm('Trigger a full git redeploy for this tenant?')) return;
              const r = await api('/api/ops/tenants/' + slug + '/redeploy', { method: 'POST' });
              toast('Redeploy started — ' + (r.pages_deployment_id || r.deployment_id));
            } else if (act === 'retry') {
              await api('/api/ops/tenants/' + slug + '/retry', { method: 'POST' });
              toast('Provisioning restarted');
            } else if (act === 'activate') {
              await api('/api/tenants/' + slug + '/status', { method: 'PATCH', body: JSON.stringify({ status: 'active' }) });
              toast('Activated');
            } else if (act === 'suspend') {
              await api('/api/tenants/' + slug + '/status', { method: 'PATCH', body: JSON.stringify({ status: 'suspended' }) });
              toast('Suspended');
            } else if (act === 'pesapal') {
              const r = await api('/api/ops/tenants/' + slug + '/pesapal');
              document.getElementById('pesapal-result').innerHTML =
                '<pre style="font-size:0.75rem;background:#f1f5f9;padding:0.75rem;border-radius:6px;overflow:auto">' +
                esc(JSON.stringify(r, null, 2)) + '</pre>';
            } else if (act === 'delete') {
              document.getElementById('delete-panel').classList.remove('hidden');
              return;
            }
            await loadDetail(slug);
            await loadTenants();
            await loadMetrics();
          } catch (e) {
            toast(e.message);
          } finally {
            btn.disabled = false;
          }
        });
      });

      document.getElementById('delete-cancel')?.addEventListener('click', () => {
        document.getElementById('delete-panel')?.classList.add('hidden');
        const input = document.getElementById('delete-confirm');
        if (input) input.value = '';
      });

      document.getElementById('delete-go')?.addEventListener('click', async () => {
        const confirmInput = document.getElementById('delete-confirm');
        const confirmSlug = confirmInput?.value?.trim();
        if (confirmSlug !== slug) {
          toast('Type the exact slug to confirm deletion');
          return;
        }
        const btn = document.getElementById('delete-go');
        btn.disabled = true;
        try {
          const r = await api('/api/ops/tenants/' + encodeURIComponent(slug), {
            method: 'DELETE',
            body: JSON.stringify({ confirm_slug: confirmSlug }),
          });
          toast(r.warnings?.length ? 'Deleted with warnings' : 'Tenant deleted');
          document.getElementById('detail-panel').classList.add('hidden');
          await loadTenants();
          await loadMetrics();
        } catch (e) {
          toast(e.message);
        } finally {
          btn.disabled = false;
        }
      });

      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    async function loadAuditLog() {
      const { entries } = await api('/api/ops/audit-log?limit=100');
      document.getElementById('audit-rows').innerHTML = (entries || []).map(e =>
        '<tr><td>' + fmtDate(e.created_at) + '</td>' +
        '<td><code>' + esc(e.action) + '</code></td>' +
        '<td>' + esc(e.tenant_slug || '—') + '</td>' +
        '<td style="font-size:0.8rem">' + esc(e.detail || '') + '</td></tr>'
      ).join('') || '<tr><td colspan="4">No audit entries</td></tr>';
    }

    async function loadDeployments() {
      const { deployments } = await api('/api/ops/deployments');
      document.getElementById('deploy-rows').innerHTML = (deployments || []).map(d =>
        '<tr><td><code>' + esc((d.git_sha || '').slice(0, 7)) + '</code></td>' +
        '<td>' + badge(d.status) + '</td>' +
        '<td>' + d.completed + '/' + d.total + (d.failed ? ' <span class="err">(' + d.failed + ' failed)</span>' : '') + '</td>' +
        '<td>' + fmtDate(d.started_at) + '</td></tr>'
      ).join('') || '<tr><td colspan="4">No deployments yet</td></tr>';
    }

    async function refreshAll() {
      await loadMetrics();
      await loadTenants();
    }

    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', async () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const name = tab.dataset.tab;
        document.getElementById('tab-tenants').classList.toggle('hidden', name !== 'tenants');
        document.getElementById('tab-deployments').classList.toggle('hidden', name !== 'deployments');
        document.getElementById('tab-audit').classList.toggle('hidden', name !== 'audit');
        if (name === 'deployments') await loadDeployments();
        if (name === 'audit') await loadAuditLog();
      });
    });

    document.getElementById('health-sweep-btn').addEventListener('click', async () => {
      const btn = document.getElementById('health-sweep-btn');
      btn.disabled = true;
      try {
        const r = await api('/api/ops/health-sweep', { method: 'POST' });
        toast('Health sweep: ' + r.healthy + '/' + r.total + ' healthy');
        if (r.unhealthy) await loadAuditLog();
      } catch (e) {
        toast(e.message);
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById('filter-status').addEventListener('change', loadTenants);
    document.getElementById('search').addEventListener('input', () => {
      clearTimeout(window._searchT);
      window._searchT = setTimeout(loadTenants, 300);
    });
    document.getElementById('refresh-btn').addEventListener('click', refreshAll);

    document.getElementById('login-btn').addEventListener('click', async () => {
      const secret = document.getElementById('api-secret').value.trim();
      const err = document.getElementById('login-err');
      err.classList.add('hidden');
      if (!secret) return;
      sessionStorage.setItem(TOKEN_KEY, secret);
      try {
        await api('/api/ops/metrics');
        showApp();
        await refreshAll();
      } catch (e) {
        sessionStorage.removeItem(TOKEN_KEY);
        err.textContent = 'Invalid API secret';
        err.classList.remove('hidden');
      }
    });

    document.getElementById('logout-btn').addEventListener('click', () => {
      sessionStorage.removeItem(TOKEN_KEY);
      showLogin();
    });

    if (token()) {
      api('/api/ops/metrics').then(() => { showApp(); refreshAll(); }).catch(showLogin);
    } else {
      showLogin();
    }
  </script>
</body>
</html>`;
}
