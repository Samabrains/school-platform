# school-platform

Control plane for School WaaS (Tier 2).

## Phase B — signup, trial, Pesapal (UGX live)

### Public pages

| URL | Purpose |
|-----|---------|
| `/signup` | Self-serve signup form |
| `/setup/:tenantId` | Provisioning progress |
| `/subscribe?tenant=` | Pesapal checkout |

### API

| Endpoint | Auth |
|----------|------|
| `POST /api/signup` | Public |
| `GET /api/setup/:id` | Public |
| `GET /api/public/billing/:id` | Public |
| `POST /api/billing/subscribe` | Public (tenant id) |
| `POST /webhooks/pesapal/ipn` | Pesapal |
| `GET /billing/pesapal/callback` | Pesapal redirect |

### Secrets (production)

```bash
npx wrangler secret put PLATFORM_API_SECRET
npx wrangler secret put PLATFORM_AUTH_SECRET   # shared with tenant apps for magic links
npx wrangler secret put PESAPAL_CONSUMER_KEY
npx wrangler secret put PESAPAL_CONSUMER_SECRET
npx wrangler secret put PESAPAL_IPN_NOTIFICATION_ID
npx wrangler secret put BREVO_API_KEY
npx wrangler secret put CLOUDFLARE_API_TOKEN
```

### Plans (UGX)

| Plan | Monthly |
|------|---------|
| Starter | 99,000 UGX |
| Pro | 199,000 UGX |

### Cron

Daily 08:00 UTC — trial reminders (5 days, 1 day left) and suspend expired trials.

## Setup

```bash
npm install
npm run db:create    # update wrangler.toml database_id
npm run db:migrate:remote
npm run dev
```
