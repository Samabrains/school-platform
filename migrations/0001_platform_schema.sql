-- Platform control plane schema (Tier 2 Phase A)

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  school_name TEXT NOT NULL,
  admin_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  plan TEXT NOT NULL DEFAULT 'starter',
  billing_status TEXT NOT NULL DEFAULT 'trial',
  trial_ends_at INTEGER,
  pesapal_account_number TEXT,
  pesapal_order_tracking_id TEXT,
  template_version TEXT,
  pages_project_name TEXT NOT NULL,
  production_url TEXT NOT NULL,
  d1_database_id TEXT NOT NULL,
  r2_bucket TEXT,
  vectorize_index TEXT,
  custom_domain TEXT,
  created_at INTEGER NOT NULL,
  provisioned_at INTEGER,
  suspended_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_tenants_billing_status ON tenants(billing_status);

CREATE TABLE IF NOT EXISTS provisioning_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  step TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS billing_events (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  pesapal_order_tracking_id TEXT,
  notification_type TEXT,
  payment_status TEXT,
  amount TEXT,
  currency TEXT NOT NULL DEFAULT 'UGX',
  raw_payload TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS deployments (
  id TEXT PRIMARY KEY NOT NULL,
  git_sha TEXT NOT NULL,
  triggered_by TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER
);

CREATE TABLE IF NOT EXISTS tenant_deployments (
  deployment_id TEXT NOT NULL REFERENCES deployments(id),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  status TEXT NOT NULL,
  pages_deployment_id TEXT,
  error TEXT,
  PRIMARY KEY (deployment_id, tenant_id)
);

CREATE TABLE IF NOT EXISTS admin_magic_links (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
