# Local setup (no GitHub Actions)

Platform URL: **https://school-platform.ssebasamatha.workers.dev**

## One-time setup

```powershell
cd "d:\PROJECTS\Sama academy\school-platform"
npm install
copy secrets.local.env.example secrets.local.env
npm run setup:auth
```

`setup:auth` generates **PLATFORM_API_SECRET** and **PLATFORM_AUTH_SECRET**, uploads them to the worker, and saves them in `secrets.local.env` (gitignored).

## Add your Pesapal + Brevo values

Edit `secrets.local.env`:

```
PESAPAL_CONSUMER_KEY=your-live-key
PESAPAL_CONSUMER_SECRET=your-live-secret
BREVO_API_KEY=your-brevo-key
CLOUDFLARE_API_TOKEN=your-cf-token
```

Upload:

```powershell
npm run setup:secrets
npm run deploy
```

## Register Pesapal IPN

```powershell
npm run setup:ipn
npm run setup:secrets
npm run deploy
```

IPN URL registered: `https://school-platform.ssebasamatha.workers.dev/webhooks/pesapal/ipn`

## Lincoln (manual deploy from Windows)

`pages:build` needs Linux/bash. On a machine with bash:

```bash
cd core-school-template
npm ci && npm run build && npm run pages:build
npx wrangler pages deploy .vercel/output/static --project-name lincoln-academy
```

Then set Lincoln Pages secrets (use **PLATFORM_AUTH_SECRET** from `secrets.local.env`):

```powershell
npx wrangler pages secret put PLATFORM_AUTH_SECRET --project-name lincoln-academy
npx wrangler pages secret put PLATFORM_API_URL --project-name lincoln-academy
# value: https://school-platform.ssebasamatha.workers.dev
npx wrangler pages secret put PLATFORM_TENANT_ID --project-name lincoln-academy
# value: ten_lincoln-academy
npx wrangler pages secret put ADMIN_EMAIL --project-name lincoln-academy
npx wrangler pages secret put TENANT_BILLING_STATUS --project-name lincoln-academy
# value: current
```

## Register Lincoln in platform DB

```powershell
$secret = (Get-Content secrets.local.env | Where-Object { $_ -match '^PLATFORM_API_SECRET=' }) -replace 'PLATFORM_API_SECRET=',''
$body = Get-Content scripts/seeds/lincoln-academy.json -Raw
Invoke-RestMethod -Method POST `
  -Uri "https://school-platform.ssebasamatha.workers.dev/api/tenants" `
  -Headers @{ Authorization = "Bearer $secret"; "Content-Type" = "application/json" } `
  -Body $body
```
