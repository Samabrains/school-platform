-- Signup branding, terms acceptance, ops audit log

ALTER TABLE tenants ADD COLUMN tagline TEXT;
ALTER TABLE tenants ADD COLUMN primary_color TEXT;
ALTER TABLE tenants ADD COLUMN secondary_color TEXT;
ALTER TABLE tenants ADD COLUMN terms_accepted_at INTEGER;

CREATE TABLE IF NOT EXISTS ops_audit_log (
  id TEXT PRIMARY KEY NOT NULL,
  action TEXT NOT NULL,
  tenant_id TEXT,
  tenant_slug TEXT,
  detail TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ops_audit_created ON ops_audit_log(created_at DESC);

CREATE TABLE IF NOT EXISTS signup_rate_limits (
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_signup_rate_ip ON signup_rate_limits(ip_hash, created_at);
