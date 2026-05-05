# Fleet Mileage — Project Context

> Read this at the start of every Claude session to get up to speed instantly.
> Update this file at the end of each session with any changes, decisions, or new goals.
> For full database schema, see SCHEMA.md in the same folder.

---

## What the app is

A mobile-first fleet management platform built around QR codes. Each vehicle gets a unique QR code that opens the app pre-loaded with that vehicle's details. Drivers use the app to submit mileage, report faults, and complete inspection checklists. A separate admin/mechanic dashboard provides oversight of the full fleet.

---

## Product vision — 4-stage roadmap

### Stage 1 — Mileage collection & reporting *(complete ✓)*
- Drivers submit odometer readings via QR-code-linked mobile app
- Admin dashboard shows current mileage per vehicle and full submission history
- Reporting on mileage over time per vehicle

### Stage 1.5 — Fault reporting & known issues *(complete ✓)*
- QR code now opens a **choice screen** instead of going straight to mileage entry
- Drivers choose from: Submit Mileage, Report a Fault, or View Known Issues
- Fault reporting covers 6 categories: bulb out, AdBlue low, flat/damaged tyre, windscreen chip, new dent/damage, other
- Windscreen chip and dent/damage screens include an interactive SVG diagram — driver taps to pin the location of damage
- Known issues screen shows active fleet-team notes for that vehicle (e.g. "rear wiper not working") to prevent duplicate fault reports
- Known issues are managed by admin/mechanics from the dashboard

### Stage 2 — Scheduled maintenance & automated alerts *(in progress)*

**IMPORTANT — who does what:**
- **Drivers** (via QR code) report only: mileage, and faults that are visible to them — warning lights on the dashboard (AdBlue low, engine warning etc.), flat or damaged tyres, windscreen chips, dents, bulbs out.
- **Garage assistant** (via `/admin/` interface) performs all regular scheduled checks: engine fluids, tyres, AdBlue levels, light checks, deep cleans. These are NOT submitted by drivers and are NOT QR-code driven. The garage assistant works through a list, vehicle by vehicle.

- Engine checks (oil, coolant, brake fluid) every 14 days — submitted by garage assistant via admin interface
- Tyre checks (tread depth + pressure) every 28 days — submitted by garage assistant via admin interface
- AdBlue checks every 14 days — submitted by garage assistant via admin interface (also captured reactively when a driver reports AdBlue low via fault report). AdBlue vehicles only (18 of 32).
- Light checks every 30 days — Ford, Toyota, Renault vehicles only (7 of 32) — submitted by garage assistant
- Deep clean log — no fixed schedule, log only (Martin is sole cleaner; visibility of what was done last time is the goal)
- Automatic email to fleet mechanic when thresholds are breached (e.g. tyre depth < 1.6mm, oil level low)
- Alert thresholds are configurable via the admin web interface — never hardcoded
- Admin dashboard shows gauges per vehicle: fluid levels (thermometer 0–10), AdBlue range (speedometer to 20,000 miles), tyre depths
- Admin can manage task schedules, alert thresholds, and per-vehicle rule overrides
- **Custom alerts:** admin can fire a one-off alert email from the dashboard by selecting a vehicle, typing a description (e.g. "Worn wipers need replacing"), and hitting a button. This inserts a row into the `faults` table with `fault_type = 'admin_alert'`, triggering the existing `send-fault-email` webhook. No new infrastructure needed.

### Stage 3 — Driver fault reports *(absorbed into Stage 1.5)*

### Stage 4 — Vehicle booking system
- Drivers or managers can book vehicles for specific dates
- System prevents double-bookings
- Booking history linked to vehicles and drivers

---

## Schema design principles

See SCHEMA.md for the full database schema. Key principles:

- **Drivers** need to be a first-class entity (their own table) — Stage 4 links bookings to drivers
- **Maintenance tasks** use a unified `maintenance_log` table — all task types in one place, task-specific data in JSONB
- **Bookings** in Stage 4 require transactional integrity — PostgreSQL handles this with constraints and row-level locking
- No stored derived values — calculate "next due" at query time
- Use `timestamptz` consistently throughout

---

## Live URLs

- **Driver app:** https://fleet-mileage.pages.dev/?vehicle=V001
- **Admin dashboard:** https://fleet-mileage.pages.dev/admin/

---

## Stack

- **Frontend:** Vanilla JS, Vite (no framework) — current
- **Backend/DB:** Supabase (project: `fleet-mileage-personal`, ID: `xlrtvtqwxyojhvzmsakz`, region: eu-central-2)
- **Storage:** Supabase Storage — buckets: `vehicle-images`, `fault-photos`
- **Deployment:** Cloudflare Pages (auto-deploys on git push to GitHub)
- **Previous deployment:** Netlify — migrated away 2026-05-02 after exhausting free build minutes (500/month)
- **Fonts:** Barlow + Barlow Condensed (driver app), Syne + DM Mono (admin)
- **Packages:** `@supabase/supabase-js`, `qrcode-generator`, `vite`

### Future stack direction
- Driver-facing screens stay as **vanilla JS** — fast, QR-code accessible, no installation needed
- Admin/mechanic dashboard rebuilt in **Vue 3 + Vite** — begins after Stage 2 driver forms are complete
- Vue chosen over React: gentler learning curve, Single File Components suit Martin's background, no need for React's complexity
- Next.js ruled out — SSR complexity not needed for an internal admin tool
- Flutter rejected — destroys the QR-code/no-install model for drivers
- Low-code tools (Retool, Budibase, Appsmith) rejected — lock-in, cost, or too much JS for the benefit

---

## File structure

```
fleet-mileage/
├── index.html           # Driver choice screen (mileage / fault / known issues)
├── main.js              # Driver choice screen + mileage flow logic
├── fault-report.html    # Driver fault reporting page
├── fault-report.js      # Fault reporting logic
├── known-issues.html    # Known issues page (driver-facing)
├── known-issues.js      # Known issues logic
├── style.css            # All driver-facing styles
├── supabase.config.js   # Supabase credentials (URL + anon key)
├── vite.config.js       # Vite build config (all HTML entry points registered)
├── package.json
├── README.md
├── SETUP.md
├── PROJECT.md           # This file — project context and decisions
├── SCHEMA.md            # Full Supabase schema reference
└── admin/
    ├── index.html       # Admin dashboard
    ├── admin.js         # Admin logic
    └── admin.css        # Admin styles
```

---

## How the driver app works

### Choice screen (index.html)
1. URL param `?vehicle=V001` is read on load
2. Vehicle fetched from Supabase `vehicles` table
3. Vehicle photo displayed; **plate** shown large/white/bold on top, vehicle name shown below in orange/small
4. Known issues count fetched — badge shown on the Known Issues button if any exist
5. Driver chooses: Submit Mileage, Report a Fault, or Known Issues

### Mileage flow
1. Previous mileage shown
2. Driver enters new mileage — validated (cannot be less than previous)
3. On confirm: inserts row into `mileage_log`, updates `current_mileage` on vehicle
4. Success screen shown with back-to-menu button

### Fault reporting (fault-report.html)
1. Driver taps "Report a Fault" → opens `fault-report.html?vehicle=V001`
2. Six large icon buttons — driver picks the fault category
3. Follow-up detail screen based on category:
   - **Bulb out** — pill selector for which light
   - **AdBlue low** — exact miles range + tank space in litres (nullable)
   - **Flat/damaged tyre** — pill selector for which tyre
   - **Windscreen chip** — SVG diagram, driver taps to pin location
   - **Dent/damage** — SVG top-down + side-view with tab toggle, driver taps to pin location
   - **Other** — free-text description
4. Optional driver name + optional photo upload (`fault-photos` bucket)
5. On submit: inserts into `faults` table

### Known issues (known-issues.html)
1. Fetches all `known_issues` where `resolved = false` for the vehicle
2. If none: green "No Known Issues" screen
3. If any: lists each issue with description, who logged it, and date
4. Back button returns to choice screen

### Admin dashboard
Three tabs:
- **Vehicles** — list all vehicles, add new (with photo upload), delete
- **Mileage** — list with current mileage and plate; click for full history modal
- **QR Codes** — generates QR codes client-side (canvas), plate only under each code

Vehicle photos: filename saved as `{id}.{ext}` in `image_url`. Public URL constructed at runtime as `${SUPABASE_URL}/storage/v1/object/public/vehicle-images/${encodeURIComponent(filename)}`. Bucket is **public**.

---

## Key decisions & conventions

- `image_url` on `vehicles` stores plain filename only (NOT a full URL)
- `photo_url` on `faults` stores full Supabase Storage public URL
- `make`, `model`, `year` on `vehicles` are **lowercase** in Supabase — no double-quotes needed in SQL
- `damage_location` stored as jsonb `{x, y, view}` — x/y are percentage positions, view is 'top', 'side', or 'windscreen'
- Tyre alert threshold: < 1.6mm (UK legal minimum)
- All costs: £0 — entire stack on free tiers
- No authentication on driver app or admin dashboard (internal use only)
- AdBlue always stored in litres — `adblue_unit` on `vehicles` used to convert at input time
- `adblue_unit` null = no AdBlue system (electric or older vehicle) — never use 'n/a'
- Fluid levels (oil, coolant, brake fluid) stored as integer 0–10. Driver inputs via 11 tap buttons.
- AdBlue range = exact miles from dashboard. Tank space = exact litres from dashboard (nullable).
- Driver app never prompts for overdue tasks — admin dashboard tracks and chases
- Drivers NEVER perform scheduled maintenance checks — that is exclusively the garage assistant's role
- Alert thresholds (e.g. tyre depth minimum, fluid level minimums, AdBlue range warning levels) are stored in the database and configurable via the admin interface — never hardcoded in source code
- `maintenance_log` is unified — no separate `inspections` or `cleans` tables
- Clean has no interval — log only, never flagged overdue
- No-AdBlue vehicles have no `adblue_check` row in `task_rules` (absent ≠ disabled)
- Light checks apply only to Ford, Toyota, Renault vehicles (7 of 32)

---

## Maintenance task engine — design decisions (agreed 2026-05-03)

### Core concept
- Unified `maintenance_log` — one row per completed task, `record_type` distinguishes them
- Due/overdue calculated at query time from last completion date/mileage + interval
- `task_rules` — one row per vehicle per applicable task type

### Task due logic
- Days since last completion ≥ interval_days → due
- Miles since last completion ≥ interval_miles → due
- Either condition true → due
- Both null (clean) → never flagged due

### AdBlue detail
- 18 of 32 vehicles have AdBlue (adblue_unit IS NOT NULL)
- Captured routinely (maintenance_log adblue_check) and reactively (fault report)
- Admin dashboard speedometer gauge: green to 1,500 miles, yellow at 1,500, orange at 1,000, red at 500. Scale 0–20,000.
- Tank space shown so mechanic knows how many keys to take to the car park
- UK law: engine won't start at 0 miles range. Garage action threshold: 1,000 miles.

---

## Email alerts

### Fault report emails *(working ✓ — 2026-04-29)*
- Gmail SMTP via dedicated fleet Gmail account + App Password
- Supabase Edge Function: `send-fault-email` (`supabase/functions/send-fault-email/index.ts`) using `denomailer@1.6.0` via `smtp.gmail.com:465`
- Supabase Database Webhook: `on_fault_inserted` — fires on INSERT to `faults`
- Recipient addresses + `gmail_user` stored in `public.app_settings`
- Gmail App Password stored as Edge Function secret `GMAIL_APP_PASSWORD`
- Redeploy: `supabase functions deploy send-fault-email`

### Mileage collection complete email *(working 2026-05-03)*
- Edge Function: `send-mileage-complete-email`
- Database Webhook: `on_mileage_inserted` — fires on INSERT to `mileage_log`
- Checks if all applicable vehicles for the current fleet week have been collected
- If complete: sends summary email (mechanic TO, admin CC) with plate, name, mileage, time recorded for all vehicles
- Duplicate prevention: inserts row into `mileage_collection_alerts` (unique on fleet_week + fleet_year) before sending — unique violation = already sent
- Same Gmail SMTP pattern as fault emails
- Subject: `Week N Mileage Collection Complete - N vehicles`

### Maintenance threshold alerts *(planned — Stage 2)*
- Same pattern as fault emails
- Webhook on INSERT to `maintenance_log`
- `alert_sent` flag prevents duplicate sends

---

## Known issues / bugs fixed

- [FIXED 2026-04-26] `admin.js` used `photo_url` instead of `image_url` in three places
- [FIXED 2026-05-02] `vehicle-images` bucket was private — getPublicUrl silently failing. Fixed bucket to public.
- [FIXED 2026-05-02] All 32 `image_url` values stripped to plain filenames
- [FIXED 2026-05-02] V010 had double-concatenated signed URL in `image_url` — regenerated
- [FIXED 2026-05-02] Admin auth removed — magic link rate limit (2/hour) causing friction
- [FIXED 2026-05-02] `mileage_log` had no anon SELECT policy — history modal returned empty after auth removal
- [FIXED 2026-05-02] QR cards showed vehicle ID and name — updated to plate only
- [FIXED 2026-05-02] Driver landing page showed vehicle ID — updated to plate
- [FIXED 2026-05-02] Admin mileage list showed vehicle ID — updated to plate + name in modal title
- [FIXED 2026-05-02] Driver choice screen badge had plate small/orange, name large/white — swapped
- [FIXED 2026-05-03] V027 Renault Kangoo had adblue_unit = 'gallons' — electric vehicle, corrected to null
- [CHANGED 2026-05-04] "Vehicle Out" now sets `active = false` on the `vehicles` table in Supabase. Undoing ("Move back") sets `active = true`. Previously the out state was stored only in sessionStorage and was invisible to Supabase. Tested and working ✓
- [FIXED 2026-05-04] `send-mileage-complete-email` edge function was missing CORS headers — browser preflight (OPTIONS) was returning 500, causing the Close Week button to hang on "Closing week…" and never send the email. Added `CORS_HEADERS` constant and OPTIONS handler. Redeployed as v3. Local copy also added to repo at `supabase/functions/send-mileage-complete-email/index.ts` (had previously only existed in Supabase).
- [FIXED 2026-05-04] Mileage complete email: raw vehicle data appearing above sender, sender showing raw email address, "Dum=p" encoding artifact. Fixed by: (1) adding hidden HTML preheader div to control Gmail preview snippet; (2) stripping all non-ASCII chars from plain-text fallback to prevent quoted-printable encoding corruption; (3) quoting the display name in `from` field as `"Fleet Alerts" <addr>`. Redeployed as v5.
- [FIXED 2026-05-05] Mileage email: =20 encoded spaces appearing before table, sort was by plate not vehicle ID, out vehicles not identified in warning note. Fixed by: (1) replacing all template literals with string concatenation to eliminate indentation whitespace that triggers quoted-printable =20 encoding; (2) sorting rows by vehicle id (V001, V002...) instead of plate; (3) appending out vehicle plates to warning note e.g. "3 vehicles were out (LJ17, YG63, ...)". Redeployed as v6.
- [FIXED 2026-05-05] Admin dashboard was advancing to the new fleet week on Monday instead of Friday. `getFleetWeek()` was only subtracting 1 day (keeping Monday on the previous week) but Tue/Wed/Thu rolled forward. Changed logic to always step back to the most recent Friday, so the display stays on the previous week's collection all the way through Thursday.

---

## Current status (as of 2026-05-04)

- Driver app (choice, mileage, fault, known issues): working ✓
- Admin dashboard (vehicles, mileage, QR codes): working ✓
- 32 vehicles: photos, plate, make, model, year all populated ✓
- RLS enabled on all tables ✓
- Fault report emails: working ✓
- Stage 2 schema: fully designed, migrated, and seeded ✓
  - `maintenance_log` + `task_rules` created ✓
  - `adblue_unit` on vehicles populated for all 32 ✓
  - task_rules seeded per vehicle per applicable task type ✓
- "Vehicle Out" now persists `active = false` to Supabase (2026-05-04) ✓

---

## Upcoming to-do

- [x] Stage 2 schema agreed and applied
- [x] adblue_unit populated for all 32 vehicles
- [x] task_rules seeded correctly
- [ ] Add Known Issues management UI to admin dashboard
- [x] Build garage assistant mileage collection UI (list-driven, pending/done, week-based)
- [x] "All done" email to fleet mechanic when mileage collection complete
- [ ] Build Stage 2 driver-facing forms: engine check, tyre check, AdBlue check, light check, deep clean
- [ ] Improve AdBlue fault report flow — capture exact miles + tank space
- [ ] Build admin maintenance dashboard: overdue list, fluid gauges, AdBlue speedometer, tyre depths
- [ ] Set up maintenance threshold email alerts
- [ ] Plan + begin Vue 3 admin dashboard rebuild (after Stage 2 driver forms done)

---

## Three user types — agreed 2026-05-03

- **Garage Assistant** — primary `/admin/` user. Works through a list of vehicles entering mileage and maintenance checks. List-driven workflow, not QR-code-driven.
- **Driver** — uses driver app via QR code. Submits mileage or fault reports. Already built.
- **Fleet Mechanic** — separate `/mechanic/` entry point (planned). Read-only, summary-first: mileage collection status, open faults/issues, vehicles needing attention. Does not add/delete vehicles or do data entry.

## Mileage collection rules — agreed 2026-05-03

- Collection window: Friday morning to Monday noon each week
- Fleet week = ISO week of (today − 1 day) — Monday morning still belongs to the previous fleet week
- Even fleet-weeks: all 32 vehicles collected
- Odd fleet-weeks: 28 vehicles only (fortnightly vehicles skipped)
- Fortnightly vehicles: V012 Jetta (FT12), V028 RAV 4 (CE62), V029 Silver Caddy (RF58), V032 Dump Truck (CN10)
- Fortnightly logic is purely calendar-driven (even/odd ISO week) — not mileage-driven
- If a fortnightly vehicle is missed, it simply waits for the next even week
- Week 18 (current) = even = all 32 vehicles

---

## Vue 3 learning notes

Mental model mappings for a COBOL/RPG background:
- **Single File Component (.vue)** = one file with `<template>` (layout), `<script>` (logic), `<style>` (CSS) — like a report with layout, logic, and format sections
- **Component** = reusable subroutine that returns a piece of UI
- **Props** = read-only parameters passed into a component — like subroutine arguments
- **`ref` / `reactive`** = working storage that triggers a screen redraw when it changes
- **`onMounted`** = OPEN/READ at program start — where Supabase queries go
- **`v-for`** = DO loop, **`v-if`** = conditional display, **`v-model`** = two-way bound input field

---

## Git workflow

```bash
git pull          # always first — especially on a different PC
git add .
git commit -m "describe change"
git push          # Cloudflare Pages auto-deploys
```

---

## Blueprint / reference implementation

Martin's **weekly-mileage Coda doc** is the blueprint. When planning new features, ask Martin to share the relevant part so we understand intended behaviour before building. Don't mirror the Coda data structures blindly — the Supabase schema should be designed properly.

---

## About the developer

Martin has a strong background in COBOL, JCL, RPG, OCL, SQL, Crystal Reports, CorVu B.I. (1980s–2000s). Away from programming for nearly two decades, back at it ~2 years ago via Coda.io, now building real web apps.

**When working with Martin:**
- Relate modern concepts to familiar ones (Vue `ref` = working storage; `onMounted` = OPEN/READ; `v-for` = DO loop)
- Explain modern jargon when it first appears
- Lead with the *why* as well as the *how*
- He is comfortable with structured logic, relational data, and SQL — lean into that
- Filesystem MCP and Supabase MCP are connected; GitHub connector is not
- Sessions expire mid-task — write files incrementally, confirm each before moving on

---

## How to start a Claude session

Paste this at the start of each chat:

> "Please read my PROJECT.md and SCHEMA.md at C:\Users\martinreith\Documents\dev\fleet-mileage\"

Then tell Claude what you want to work on. At the end of the session, ask Claude to update whichever file(s) changed.
