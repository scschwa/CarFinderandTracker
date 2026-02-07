# Car Finder & Tracker — Setup & Deployment Guide

## Prerequisites

- Node.js 20+
- npm 9+
- A [Supabase](https://supabase.com) account (free tier works)
- A [Vercel](https://vercel.com) account (for frontend deployment)
- A [Railway](https://railway.app) account (for worker deployment)
- A [Resend](https://resend.com) account (for email notifications, free tier: 100/day)

## Local Development Setup

### 1. Clone and install

```bash
git clone https://github.com/scschwa/CarFinderandTracker.git
cd CarFinderandTracker
npm install
cd apps/web && npm install && cd ../..
cd apps/worker && npm install && cd ../..
```

### 2. Set up Supabase

1. Create a new project at [supabase.com/dashboard](https://supabase.com/dashboard)
2. Go to **SQL Editor** and run the migration files in order:
   - `supabase/migrations/001_create_tables.sql`
   - `supabase/migrations/002_create_rls_policies.sql`
   - `supabase/migrations/003_create_indexes.sql`
3. Go to **Authentication > Settings** and configure:
   - Enable email/password sign-up
   - Set the Site URL to `http://localhost:3000` (for local dev)
   - Add `http://localhost:3000/auth/confirm` to Redirect URLs
4. Get your project credentials from **Settings > API**:
   - Project URL
   - `anon` (public) key
   - `service_role` (secret) key

### 3. Configure environment variables

Copy `.env.example` to `.env.local` in `apps/web/`:

```bash
cp .env.example apps/web/.env.local
```

Edit `apps/web/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
RESEND_API_KEY=your-resend-api-key-here
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

For the worker, create `apps/worker/.env`:

```
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
RESEND_API_KEY=your-resend-api-key-here
WORKER_API_KEY=pick-a-strong-random-secret
RUN_ON_START=true
```

### 4. Run the frontend

```bash
npm run dev
```

Visit `http://localhost:3000`.

### 5. Run the worker (for scraping)

```bash
npm run worker:dev
```

The worker will start and, if `RUN_ON_START=true`, immediately scrape all active searches.

## Production Deployment

### Frontend (Vercel)

1. Push the repo to GitHub
2. Import the project in Vercel
3. Set the **Root Directory** to `apps/web`
4. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `RESEND_API_KEY`
   - `NEXT_PUBLIC_APP_URL` (your Vercel domain, e.g. `https://carfinder.vercel.app`)
   - `WORKER_URL` (your Railway worker's public URL, e.g. `https://your-worker.railway.app`)
   - `WORKER_API_KEY` (same secret you set in Railway)
5. Deploy

### Worker (Railway)

1. Create a new project in Railway
2. Connect your GitHub repo
3. Set the **Root Directory** to `apps/worker`
4. Railway will detect the Dockerfile and build automatically
5. Add environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `RESEND_API_KEY`
   - `WORKER_API_KEY` (generate a strong random secret, e.g. `openssl rand -hex 32`)
   - `RUN_ON_START=false` (let it run on its cron schedule)
   - `PROXY_URL` (optional, required for Autotrader — e.g. `http://user:pass@smartproxy.crawlbase.com:8012`)
6. Deploy
7. After deploying, note the worker's public URL from Railway (Settings > Networking > Public Networking). Add this as `WORKER_URL` in your Vercel env vars.

The worker runs a cron job at **7:00 AM ET daily** to scrape all active searches. It also exposes an HTTP endpoint so the web app can trigger on-demand scrapes when users click "Run Search Now".

### Supabase (Production)

1. Update **Authentication > Settings**:
   - Set Site URL to your production domain
   - Add `https://yourdomain.com/auth/confirm` to Redirect URLs
2. Consider enabling rate limiting and abuse protection
3. Monitor usage in the Supabase dashboard

### Resend (Email)

1. Create an account at [resend.com](https://resend.com)
2. Add and verify your domain (or use the sandbox domain for testing)
3. Get your API key and add it to both Vercel and Railway env vars
4. Update the `from` address in `apps/worker/src/services/notifier.ts` to match your verified domain

## Architecture Overview

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────┐
│   Vercel      │     │   Supabase       │     │   Railway     │
│   (Next.js)   │◄───►│   (PostgreSQL)   │◄───►│   (Worker)    │
│   Frontend    │     │   Auth + RLS     │     │   Scrapers    │
│   API Routes  │     │   Database       │     │   Cron Jobs   │
└──────┬───────┘     └──────────────────┘     └──────┬───────┘
       │                                              │
       │         POST /trigger/:searchId              │
       └─────────────────────────────────────────────►│
                                                      │
                                               ┌──────┴──────┐
                                               │   Resend     │
                                               │   (Email)    │
                                               └─────────────┘
```

## Key Environment Variables

| Variable | Used By | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Web | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Web | Supabase anonymous key (safe for browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Web + Worker | Supabase service role key (server-only, bypasses RLS) |
| `SUPABASE_URL` | Worker | Same as NEXT_PUBLIC_SUPABASE_URL (worker uses different env var name) |
| `RESEND_API_KEY` | Worker | Resend email API key |
| `NEXT_PUBLIC_APP_URL` | Web | Public URL of the frontend app |
| `WORKER_URL` | Web | Public URL of the Railway worker (e.g. `https://your-worker.railway.app`) |
| `WORKER_API_KEY` | Web + Worker | Shared secret for authenticating web-to-worker requests |
| `RUN_ON_START` | Worker | Set to "true" to run scraping immediately on worker start |
| `PROXY_URL` | Worker | Residential proxy URL for Autotrader (e.g. `http://user:pass@smartproxy.crawlbase.com:8012`) |
