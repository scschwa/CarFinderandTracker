# Car Finder & Tracker — Implementation Plan

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | Next.js 14 (App Router) | SSR, API routes, Vercel-native |
| UI | Tailwind CSS + shadcn/ui | Dark theme support, clean components |
| Charts | Recharts | Lightweight, React-native charting |
| Auth | Supabase Auth | Built-in email/password, RLS integration |
| Database | Supabase PostgreSQL | Hosted Postgres, RLS, realtime |
| Email | Resend | Developer-friendly transactional email |
| Scraping | Playwright (Autotrader) + Cheerio (BaT, C&B) | Headless browser for bot-heavy sites, lightweight parser for simpler ones |
| Cron/Worker | Railway (Node.js service) | Scheduled scraping, long-running jobs |
| Deployment | Vercel (frontend) + Railway (worker) + Supabase (DB) | As specified |

## Project Structure

```
CarFinderAndTracker/
├── apps/
│   ├── web/                          # Next.js frontend (deployed to Vercel)
│   │   ├── app/
│   │   │   ├── layout.tsx            # Root layout (dark theme, fonts)
│   │   │   ├── page.tsx              # Landing page
│   │   │   ├── login/page.tsx        # Login form
│   │   │   ├── signup/page.tsx       # Registration form
│   │   │   ├── auth/confirm/route.ts # Email confirmation callback
│   │   │   ├── dashboard/
│   │   │   │   ├── page.tsx          # Main dashboard — create searches
│   │   │   │   ├── searches/
│   │   │   │   │   ├── page.tsx              # View all saved searches
│   │   │   │   │   └── [searchId]/page.tsx   # View results for one search
│   │   │   │   ├── favorites/page.tsx        # Favorited vehicles
│   │   │   │   └── settings/page.tsx         # Notification preferences
│   │   │   └── vehicle/
│   │   │       └── [vin]/page.tsx    # Vehicle detail (VIN lookup) — target="_blank"
│   │   ├── api/
│   │   │   ├── searches/route.ts             # CRUD for saved searches
│   │   │   ├── searches/[id]/route.ts        # Single search operations
│   │   │   ├── searches/[id]/export/route.ts # CSV export
│   │   │   ├── searches/[id]/trigger/route.ts# Manual re-scrape trigger
│   │   │   ├── vehicles/[vin]/route.ts       # VIN lookup proxy
│   │   │   ├── vehicles/[id]/hide/route.ts   # Hide a vehicle
│   │   │   ├── vehicles/[id]/favorite/route.ts# Favorite a vehicle
│   │   │   └── notifications/route.ts        # Notification settings CRUD
│   │   ├── components/
│   │   │   ├── ui/                   # shadcn/ui components
│   │   │   ├── search-form.tsx       # Make/model/trim/year/zip form
│   │   │   ├── vehicle-card.tsx      # Car listing card
│   │   │   ├── vehicle-table.tsx     # Table view with sorting/filtering
│   │   │   ├── price-chart.tsx       # Recharts price history
│   │   │   ├── status-badge.tsx      # Active/Sold/Delisted/Cross-listed badge
│   │   │   ├── market-stats.tsx      # Avg/median/low price summary
│   │   │   ├── search-list.tsx       # List of saved searches
│   │   │   └── navbar.tsx            # Top navigation
│   │   ├── lib/
│   │   │   ├── supabase/
│   │   │   │   ├── client.ts         # Browser Supabase client
│   │   │   │   ├── server.ts         # Server-side Supabase client
│   │   │   │   └── middleware.ts     # Auth middleware
│   │   │   ├── utils.ts              # Shared utilities
│   │   │   └── types.ts              # TypeScript types
│   │   ├── middleware.ts             # Next.js middleware (auth redirect)
│   │   ├── tailwind.config.ts
│   │   ├── next.config.js
│   │   └── package.json
│   │
│   └── worker/                       # Railway scraping worker
│       ├── src/
│       │   ├── index.ts              # Entry point, cron scheduler
│       │   ├── scrapers/
│       │   │   ├── autotrader.ts     # Playwright-based Autotrader scraper
│       │   │   ├── bat.ts            # Cheerio-based Bring a Trailer scraper
│       │   │   ├── carsandbids.ts    # Cheerio-based Cars & Bids scraper
│       │   │   └── types.ts          # Shared scraper result types
│       │   ├── services/
│       │   │   ├── search-runner.ts  # Orchestrates scraping for a search
│       │   │   ├── vehicle-tracker.ts# Status detection (sold/delisted/active)
│       │   │   ├── price-recorder.ts # Records price snapshots
│       │   │   └── notifier.ts       # Sends price drop emails via Resend
│       │   ├── db/
│       │   │   └── client.ts         # Supabase service-role client
│       │   └── utils/
│       │       ├── retry.ts          # Retry logic for scraping
│       │       └── proxy.ts          # Optional proxy rotation
│       ├── package.json
│       └── Dockerfile
│
├── supabase/
│   └── migrations/
│       ├── 001_create_tables.sql
│       ├── 002_create_rls_policies.sql
│       └── 003_create_indexes.sql
│
├── package.json                      # Workspace root (npm workspaces)
├── turbo.json                        # Turborepo config (optional)
└── .env.example
```

## Database Schema

### Tables

```sql
-- Supabase Auth handles the `auth.users` table automatically.
-- We reference auth.users.id as user_id throughout.

-- 1. Saved Searches
CREATE TABLE saved_searches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  make          TEXT NOT NULL,
  model         TEXT NOT NULL,
  trim          TEXT,                    -- nullable, user may not specify
  year_min      INT NOT NULL,
  year_max      INT NOT NULL,
  zip_code      TEXT NOT NULL,
  search_radius INT DEFAULT 100,         -- miles
  is_active     BOOLEAN DEFAULT true,    -- user can pause a search
  -- No limit on number of searches per user
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- 2. Vehicles (unique by VIN across all users)
CREATE TABLE vehicles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vin           TEXT UNIQUE NOT NULL,
  make          TEXT,
  model         TEXT,
  trim          TEXT,
  year          INT,
  exterior_color TEXT,
  interior_color TEXT,
  mileage       INT,
  transmission  TEXT,
  drivetrain    TEXT,
  engine        TEXT,
  vin_data      JSONB,                   -- cached NHTSA decode response
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 3. Listings (a vehicle found on a specific source site, linked to a search)
CREATE TABLE listings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id    UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  search_id     UUID NOT NULL REFERENCES saved_searches(id) ON DELETE CASCADE,
  source_site   TEXT NOT NULL CHECK (source_site IN ('autotrader', 'bat', 'carsandbids')),
  url           TEXT NOT NULL,
  current_price INT,                     -- cents to avoid float issues
  sale_price    INT,                     -- set when status = 'sold'
  geography     TEXT,                    -- city/state or zip
  distance_mi   INT,                    -- distance from search zip
  image_url     TEXT,                    -- hotlinked from source site (not stored locally)
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'cross_listed', 'sold', 'delisted')),
  first_seen    TIMESTAMPTZ DEFAULT now(),
  last_seen     TIMESTAMPTZ DEFAULT now(),
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 4. Price History
CREATE TABLE price_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id    UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  price         INT NOT NULL,            -- cents
  recorded_at   TIMESTAMPTZ DEFAULT now()
);

-- 5. User-Vehicle Preferences (hide, favorite)
CREATE TABLE user_vehicle_prefs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id    UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  is_hidden     BOOLEAN DEFAULT false,
  is_favorited  BOOLEAN DEFAULT false,
  UNIQUE(user_id, listing_id)
);

-- 6. Notification Settings
CREATE TABLE notification_settings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  search_id           UUID NOT NULL REFERENCES saved_searches(id) ON DELETE CASCADE,
  price_drop_enabled  BOOLEAN DEFAULT false,
  price_drop_pct      INT DEFAULT 5,      -- notify if price drops by X%
  new_listing_enabled BOOLEAN DEFAULT true,
  sold_alert_enabled  BOOLEAN DEFAULT false,
  email               TEXT,                -- override email if different from auth
  UNIQUE(user_id, search_id)
);

-- 7. Scrape Log (for debugging / observability)
CREATE TABLE scrape_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id     UUID NOT NULL REFERENCES saved_searches(id) ON DELETE CASCADE,
  source_site   TEXT NOT NULL,
  status        TEXT NOT NULL,            -- 'success', 'error', 'partial'
  listings_found INT DEFAULT 0,
  error_message TEXT,
  duration_ms   INT,
  scraped_at    TIMESTAMPTZ DEFAULT now()
);
```

### Row Level Security Policies

```sql
-- saved_searches: users see only their own
ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own searches" ON saved_searches
  FOR ALL USING (auth.uid() = user_id);

-- listings: users see listings for their searches only
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own listings" ON listings
  FOR SELECT USING (
    search_id IN (SELECT id FROM saved_searches WHERE user_id = auth.uid())
  );

-- user_vehicle_prefs: users see only their own
ALTER TABLE user_vehicle_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own prefs" ON user_vehicle_prefs
  FOR ALL USING (auth.uid() = user_id);

-- notification_settings: users see only their own
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own notifications" ON notification_settings
  FOR ALL USING (auth.uid() = user_id);

-- vehicles: readable by any authenticated user (shared data)
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read vehicles" ON vehicles
  FOR SELECT USING (auth.role() = 'authenticated');

-- price_history: readable via listing access
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see price history for their listings" ON price_history
  FOR SELECT USING (
    listing_id IN (
      SELECT l.id FROM listings l
      JOIN saved_searches s ON l.search_id = s.id
      WHERE s.user_id = auth.uid()
    )
  );
```

### Key Indexes

```sql
CREATE INDEX idx_listings_search_id ON listings(search_id);
CREATE INDEX idx_listings_vehicle_id ON listings(vehicle_id);
CREATE INDEX idx_listings_status ON listings(status);
CREATE INDEX idx_price_history_listing_id ON price_history(listing_id);
CREATE INDEX idx_price_history_recorded_at ON price_history(recorded_at);
CREATE INDEX idx_vehicles_vin ON vehicles(vin);
CREATE INDEX idx_saved_searches_user_id ON saved_searches(user_id);
CREATE INDEX idx_user_vehicle_prefs_user_listing ON user_vehicle_prefs(user_id, listing_id);
```

## Scraping Architecture

### Autotrader (Playwright)
- **Why Playwright**: Autotrader uses heavy JavaScript rendering + bot detection
- Construct search URL from make/model/trim/year/zip parameters
- Launch headless Chromium, navigate to search results
- Extract: title, price, mileage, location, URL, VIN (from detail page if needed)
- Use stealth plugin (`playwright-extra` + `playwright-extra-plugin-stealth`)
- Rate limit: 2-3 second delays between pages, max 5 pages per search
- Retry with exponential backoff on failures

### Bring a Trailer (Cheerio)
- **Why Cheerio**: BaT has server-rendered HTML, lighter bot detection
- Construct search URL, fetch HTML with randomized user-agents
- Parse listing cards: title, current bid, location, URL, time remaining
- For completed auctions: extract sold price, "sold" status
- VIN often in listing body text — extract with regex

### Cars & Bids (Cheerio)
- **Why Cheerio**: Similar to BaT, mostly server-rendered
- Construct search URL, fetch with rotating user-agents
- Parse: title, current bid, location, URL, auction status
- Extract VIN from listing detail page
- Detect sold status from auction result

### Shared Scraping Logic
- Each scraper returns a common `ScrapedListing` type:
  ```ts
  type ScrapedListing = {
    vin: string | null;
    title: string;
    price: number;         // in cents
    url: string;
    sourceSite: 'autotrader' | 'bat' | 'carsandbids';
    location: string;
    mileage: number | null;
    status: 'active' | 'sold';
    salePrice: number | null;
    imageUrl: string | null;
  }
  ```
- VIN matching: when a vehicle is found on multiple sites, link them via the `vehicles` table VIN and mark as `cross_listed`

## Cron Job / Worker Design (Railway)

```
7:00 AM ET — Cron triggers
  └─> Fetch all active saved_searches from Supabase
  └─> For each search (batched, concurrency-limited to 3):
      └─> Run Autotrader scraper
      └─> Run BaT scraper
      └─> Run C&B scraper
      └─> For each scraped listing:
          ├─> Upsert into vehicles table (by VIN)
          ├─> Upsert into listings table (by vehicle_id + source_site + search_id)
          ├─> Record price snapshot in price_history
          └─> Check for cross-listing (same VIN, different source_site)
      └─> For listings previously active but NOT found in this scrape:
          ├─> If auction site shows "sold" → status = 'sold', record sale_price
          └─> Otherwise → status = 'delisted', keep last known price
      └─> Log results to scrape_log
      └─> Check notification_settings, send emails for:
          ├─> Price drops exceeding threshold
          ├─> New listings found
          └─> Vehicles sold (if alert enabled)
```

- Use `node-cron` for scheduling within the Railway service
- Supabase service-role key (bypasses RLS) for write operations
- Concurrency control via `p-limit` to avoid overwhelming sites
- Total scrape time target: < 30 minutes for all users

## API Routes

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/searches` | List user's saved searches |
| POST | `/api/searches` | Create new saved search |
| GET | `/api/searches/[id]` | Get search details + listings |
| PATCH | `/api/searches/[id]` | Update search (pause, edit params) |
| DELETE | `/api/searches/[id]` | Delete search + cascade listings |
| GET | `/api/searches/[id]/export` | Generate CSV of search results |
| POST | `/api/searches/[id]/trigger` | Manually trigger a re-scrape |
| GET | `/api/vehicles/[vin]` | VIN decode via NHTSA API |
| POST | `/api/vehicles/[id]/hide` | Toggle hide on a listing |
| POST | `/api/vehicles/[id]/favorite` | Toggle favorite on a listing |
| GET | `/api/notifications` | Get user's notification settings |
| PUT | `/api/notifications` | Update notification settings |

## Frontend Pages

### 1. Landing Page (`/`)
- Hero section with app description
- Login / Sign Up buttons
- Clean, dark theme

### 2. Login (`/login`) & Signup (`/signup`)
- Email + password forms
- Email verification flow
- "Forgot password" link

### 3. Dashboard (`/dashboard`)
- **Search form**: Make (dropdown), Model (dropdown, filtered by make), Trim (text), Year Min/Max (dropdowns), Zip Code, Search Radius
- **Recent searches**: Quick-access cards for existing searches
- **Market stats**: Summary of all active searches

### 4. Saved Searches List (`/dashboard/searches`)
- Card or list view of all saved searches
- Each card shows: make/model/year range, number of active listings, last refreshed time
- Click to view results

### 5. Search Results (`/dashboard/searches/[searchId]`)
- **Market summary bar**: avg price, median, lowest, listing count
- **Filter bar**: status (active/sold/delisted), source site, price range, sort by
- **Vehicle cards/table**: Each shows image, title, price, location, status badge, actions (hide/favorite)
- **Price chart**: Click a vehicle to see inline price history chart
- **Export CSV** button

### 6. Vehicle Detail (`/vehicle/[vin]`) — Opens in new tab
- VIN decode info from NHTSA (year, make, model, body type, engine, plant, etc.)
- All listings for this VIN across sources
- Price history chart
- Links to source listings

### 7. Favorites (`/dashboard/favorites`)
- Filtered view of all favorited vehicles across all searches

### 8. Settings (`/dashboard/settings`)
- Notification preferences per search
- Price drop threshold configuration
- Email preferences

## Key Decisions

- **Saved searches**: Unlimited per user
- **Manual refresh**: Users can trigger an on-demand re-scrape in addition to the 7am ET daily cron
- **Vehicle images**: Hotlinked from source sites (no local storage); images may break if listings are removed
- **Refresh timezone**: Fixed at 7:00 AM US Eastern for all users

## Key Libraries

| Package | Purpose |
|---------|---------|
| `next` (14.x) | Frontend framework |
| `@supabase/supabase-js` | Supabase client |
| `@supabase/ssr` | Server-side Supabase helpers for Next.js |
| `tailwindcss` | Utility-first CSS |
| `shadcn/ui` | Pre-built UI components (dark theme) |
| `recharts` | Price history charts |
| `playwright` | Autotrader scraping (worker only) |
| `cheerio` | BaT + C&B HTML parsing |
| `playwright-extra` + stealth plugin | Anti-bot evasion |
| `node-cron` | Cron scheduling in Railway worker |
| `p-limit` | Concurrency control |
| `resend` | Transactional email |
| `zod` | Input validation (API routes + forms) |
| `react-hook-form` | Form handling |
| `@tanstack/react-query` | Client-side data fetching/caching |
| `lucide-react` | Icon set |
| `papaparse` | CSV generation |
| `date-fns` | Date formatting |

## VIN Lookup Integration

- **NHTSA vPIC API** (free, no key required):
  `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/{vin}?format=json`
- Returns: Make, Model, Year, Body Class, Engine, Displacement, Fuel Type, Plant City/Country, GVWR, etc.
- Cache results in `vehicles.vin_data` JSONB column to avoid repeat lookups
- Display on `/vehicle/[vin]` page in organized sections

## Notification System

1. During the cron scrape, after processing each search:
   - Compare new prices against previous `price_history` entries
   - Check `notification_settings` for that search
   - If price dropped by >= configured %, queue notification
   - If new listing found and `new_listing_enabled`, queue notification
   - If vehicle sold and `sold_alert_enabled`, queue notification

2. Send via **Resend** API (free tier: 100 emails/day, sufficient for early users)
   - Simple HTML email template with car details + link to app
   - Batch notifications per user (one email with all alerts, not per-vehicle)

## Design System

- **Background**: `#0a0a0f` (near-black), `#111827` (dark grey cards)
- **Primary**: `#1e40af` (dark blue), `#3b82f6` (medium blue for accents)
- **Text**: `#f9fafb` (white), `#9ca3af` (grey), `#93c5fd` (light blue links)
- **Status colors**:
  - Active: `#22c55e` (green)
  - Sold: `#ef4444` (red)
  - Delisted: `#f59e0b` (amber)
  - Cross-listed: `#8b5cf6` (purple)
- **Cards**: Subtle border (`#1f2937`), slight shadow, rounded corners
- **Font**: Inter (clean, modern sans-serif)

## Implementation Order

1. **Project scaffolding** — Initialize monorepo, Next.js app, worker package, install dependencies
2. **Supabase setup** — Create project, run migrations, configure Auth, set up RLS
3. **Auth flow** — Signup, login, email verification, middleware protection
4. **Database schema** — All tables, indexes, RLS policies
5. **Search form + saved searches CRUD** — Create/view/delete searches
6. **Scraper: Bring a Trailer** — Easiest to scrape, validate data pipeline end-to-end
7. **Scraper: Cars & Bids** — Similar pattern to BaT
8. **Scraper: Autotrader** — Most complex, Playwright + stealth
9. **Search results page** — Display listings, status badges, filtering, sorting
10. **Price history tracking** — Record daily prices, build chart component
11. **Vehicle detail page** — VIN decode + display
12. **Status detection** — Sold/delisted/cross-listed logic
13. **Hide + Favorite functionality** — User preferences
14. **Market summary stats** — Aggregate calculations per search
15. **Notifications** — Settings UI + email sending logic
16. **CSV export** — Generate and download
17. **Cron job integration** — Wire up Railway worker with full pipeline
18. **Styling polish** — Dark theme refinement, responsive design, loading states
19. **Testing + error handling** — Edge cases, scraper failures, auth edge cases
20. **Deployment** — Vercel + Railway + Supabase production config

## Verification / Testing Plan

1. **Auth**: Sign up with a new email, verify email link works, login/logout cycle
2. **Search creation**: Create a search for a common car (e.g., Toyota Camry 2020-2024, 10001) — verify it saves to DB
3. **Scraping**: Manually trigger scrape for each site — verify listings appear in DB and on the results page
4. **Price tracking**: Run scrape twice (modify a price manually in DB between runs) — verify price chart shows change
5. **Status detection**: Remove a listing from scrape results — verify it becomes "delisted"; mark one as sold — verify "sold" status
6. **VIN lookup**: Click a vehicle — verify NHTSA data loads on detail page
7. **Hide/Favorite**: Hide a car — verify it disappears from main view; favorite a car — verify it appears on favorites page
8. **CSV export**: Export a search — verify CSV downloads with correct data
9. **Notifications**: Set a price drop alert, simulate a price drop — verify email is sent
10. **Concurrent users**: Test with two accounts simultaneously — verify data isolation via RLS
