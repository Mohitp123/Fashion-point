# Fashion Point — MVP

A working business OS for local clothing shops: auth, products/variants, inventory,
POS/sales, customers, and a dashboard. Zero external dependencies — runs on plain
Node.js (built-in SQLite + crypto), so `npm install` installs nothing and there's
nothing to go wrong at deploy time.

## What's been tested end-to-end (in a real running instance, not just read over)

- Register a shop → login → JWT auth
- Add a product with variants (size/color/SKU/price)
- Record a sale: inventory decreases by the exact quantity sold, profit is
  calculated as (price − cost) per line, customer purchase history updates
- Overselling is blocked with a clean rollback (no partial writes)
- **Tenant isolation**: a second registered shop sees zero data from the first,
  and a direct request for another shop's customer by ID returns 404, not the data
- Dashboard numbers (revenue, profit, low stock, inactive customers) come from
  real seeded transactions, not placeholder text
- Static frontend (login, dashboard, POS, products, customers) served correctly

## ⚠️ One thing to know before you rely on this for real shop data

This app stores data in a local SQLite file. That's what let me build and fully
test it without any external services. **Render's free web service tier does not
persist local files** — the file resets when the service restarts or redeploys
(confirmed from Render's current docs, checked today). Two ways to fix this,
both cheap:

1. **$7/month Render Starter plan + a persistent disk** — zero code changes,
   just attach a disk to the same app. Simplest fix.
2. **Migrate to Neon** (genuinely free, permanent Postgres, no card required,
   no expiry) — this needs the database layer rewritten from SQLite to Postgres.
   I can do this next if you want true $0 persistence, but I want to flag that
   I can't install the Postgres client package in my current sandbox (no
   internet access here) to test it before handing it to you — so it would
   need a smoke test on your end right after deploy, and I'd fix anything that
   comes up.

For a first live version to show shop owners and gather feedback, option 1 or
even the free tier as-is (fine for a demo, data just isn't durable) both work
today with zero extra effort.

## Run locally

```bash
npm run seed    # creates data.sqlite with demo data (Fashion Point / 30 customers / 110 sales)
npm start        # http://localhost:3000
```

Demo login: `owner@fashionpoint.demo` / `demo1234`

## Deploy free to Render (~10 minutes, your side)

1. Push this folder to a new GitHub repo (public or private, either works).
2. Go to [render.com](https://render.com) → sign up free (no card required) →
   **New → Blueprint** → connect your repo. Render will read `render.yaml`
   automatically and configure everything.
3. Click **Apply**. Render builds and deploys — you'll get a live URL like
   `https://fashion-point.onrender.com`.
4. Open a shell for the service (Render dashboard → your service → Shell) and run:
   ```
   node seed.js
   ```
   to load demo data, or just register your own shop from the live URL.
5. Done — that URL is live and shareable.

Note: free-tier services sleep after 15 minutes of inactivity and take ~30–60
seconds to wake on the next request. That's normal for free hosting, not a bug.

## What's next (not built yet, by design — see the phasing rationale)

- P1: purchase entry UI, rule-based follow-ups, returns, credit/udhaar, staff roles
- P2: WhatsApp Cloud API integration, AI follow-up generator, AI business assistant,
  campaigns
- Postgres migration for guaranteed free persistence (see caveat above)

None of these are hard blockers to using the P0 app for real sales today — they're
the next milestones per the original phased plan.
