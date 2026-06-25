export type TenantStatus =
  | "draft"
  | "provisioning"
  | "trialing"
  | "active"
  | "suspended"
  | "cancelled"
  | "deleted";

export type BillingStatus = "trial" | "current" | "past_due" | "cancelled";

export interface Tenant {
  id: string;
  slug: string;
  school_name: string;
  admin_email: string;
  admin_phone?: string | null;
  status: TenantStatus;
  plan: string;
  billing_status: BillingStatus;
  trial_ends_at: number | null;
  pesapal_account_number: string | null;
  pesapal_order_tracking_id: string | null;
  template_version: string | null;
  pages_project_name: string;
  production_url: string;
  d1_database_id: string;
  r2_bucket: string | null;
  vectorize_index: string | null;
  custom_domain: string | null;
  cron_secret?: string | null;
  tagline?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  terms_accepted_at?: number | null;
  created_at: number;
  provisioned_at: number | null;
  suspended_at: number | null;
}

export interface Env {
  DB: D1Database;
  PLATFORM_API_SECRET?: string;
  PLATFORM_AUTH_SECRET?: string;
  PLATFORM_PUBLIC_URL?: string;
  BILLING_CURRENCY?: string;
  PESAPAL_ENVIRONMENT?: string;
  PESAPAL_CONSUMER_KEY?: string;
  PESAPAL_CONSUMER_SECRET?: string;
  PESAPAL_IPN_NOTIFICATION_ID?: string;
  BREVO_API_KEY?: string;
  BREVO_SENDER_EMAIL?: string;
  BREVO_SENDER_NAME?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  TEMPLATE_GITHUB_OWNER?: string;
  TEMPLATE_GITHUB_REPO?: string;
  TEMPLATE_GITHUB_BRANCH?: string;
  TEMPLATE_BUILD_COMMAND?: string;
  TEMPLATE_BUILD_OUTPUT_DIR?: string;
  TEMPLATE_GIT_SHA?: string;
  /** e.g. samabrains.com → https://{slug}.samabrains.com */
  TENANT_BASE_DOMAIN?: string;
}
