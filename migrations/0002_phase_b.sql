CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  monthly_amount_ugx INTEGER NOT NULL,
  features_json TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1
);

INSERT OR IGNORE INTO plans (id, name, monthly_amount_ugx, features_json) VALUES
  ('starter', 'Starter', 99000, '["chatbot","parent_hub","forms","news"]'),
  ('pro', 'Pro', 199000, '["chatbot","parent_hub","forms","news","alumni","careers"]');

CREATE TABLE IF NOT EXISTS notification_log (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  type TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  UNIQUE(tenant_id, type)
);

ALTER TABLE tenants ADD COLUMN admin_phone TEXT;
ALTER TABLE tenants ADD COLUMN last_reminder_day INTEGER;
