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

## Signup auto-provisioning (no GitHub Actions)

Each new school signup runs this pipeline on the platform worker:

1. Create D1, R2, Vectorize  
2. **Create Pages project** — auto-linked to `Samabrains/core-school-template` on GitHub  
3. **Bindings & env vars** — D1/R2/Vectorize bindings, JWT, admin email, school name/colors, trial dates  
4. **Migrate** template tables into tenant D1  
5. **Deploy** — Cloudflare builds from Git (`npm ci && npm run build && npm run pages:build`)  
6. **Bootstrap** — seed welcome post, FAQs, AI persona  

Verify Git provisioning works before signup:

```powershell
npm run provision:verify
```

Future template updates: push to `main` on `core-school-template` → each connected school project auto-rebuilds on Cloudflare.

### One-time: link Cloudflare to GitHub (easiest path)

You do **not** need to create a new Pages project. Only install the Cloudflare GitHub app once.

1. Open while logged into GitHub as an admin of **Samabrains**:  
   **https://github.com/apps/cloudflare-workers-and-pages/installations/new**
2. Choose **Samabrains** (organization).
3. Under repository access, pick **Only select repositories** → check **`core-school-template`**.
4. Click **Install** (or **Save** if already installed).

That is enough. The platform worker attaches each new school to that repo via API. Builds run on Cloudflare — **not** GitHub Actions.

**Optional (dashboard):**  
[Cloudflare Workers & Pages](https://dash.cloudflare.com/17ac8e645ffc2337eceac4d16704fc96/workers-and-pages) → **Create** → **Pages** → **Connect to Git** — only if the app install above did not run. Authorize GitHub, pick **Samabrains** / **core-school-template**. You can cancel the “create project” wizard after Git is authorized.

`CLOUDFLARE_API_TOKEN` must include **Pages Edit** (and D1, R2, Vectorize).

### Manual fallback (if Git connect fails)

```powershell
cd school-platform
npm run tenant:complete -- --slug=your-school-slug
```

## Lincoln (manual deploy from Windows)

`pages:build` needs Linux/bash for the default script. On Windows use the junction-based helper (no admin/Developer Mode required if Git for Windows is installed):

```powershell
cd core-school-template
npm ci
npm run pages:build:win
$env:CLOUDFLARE_ACCOUNT_ID = "17ac8e645ffc2337eceac4d16704fc96"
npx wrangler pages deploy .vercel/output/static --project-name lincoln-academy
```

On Linux/bash:

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
