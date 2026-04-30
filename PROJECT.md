# Fleet Mileage — Project Context

> Read this at the start of every Claude session to get up to speed instantly.
> Update this file at the end of each session with any changes, decisions, or new goals.

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

### Stage 2 — Scheduled maintenance & automated alerts *(next)*
- Fortnightly engine and tyre checks submitted via QR code by drivers
- Automatic email to fleet mechanic when thresholds are breached (e.g. tyre depth < 1.6mm, oil level critical)
- Monthly deep clean checklist with cleaning history per vehicle
- Admin can manage task schedules, mechanics, and notification rules

### Stage 3 — Driver fault reports *(absorbed into Stage 1.5)*

### Stage 4 — Vehicle booking system
- Drivers or managers can book vehicles for specific dates
- System prevents double-bookings
- Booking history linked to vehicles and drivers

---

## Schema design — get it right from the start

Because this app will grow across four stages, the Supabase schema must be designed with the full vision in mind — not just Stage 1. Retrofitting a schema after data has accumulated is painful and risky.

Key principles:
- **Drivers** need to be a first-class entity (their own table) from Stage 1, even if not fully used yet — Stage 3 and Stage 4 both link faults and bookings to specific drivers
- **Vehicles** already exist but will need additional columns (e.g. service intervals, assigned mechanic) added progressively
- **Maintenance tasks** in Stage 2 require a tasks table, a schedules table, and a log of completed/triggered events — plan foreign keys now
- **Bookings** in Stage 4 require transactional integrity (no double-bookings) — PostgreSQL handles this well with constraints and row-level locking
- Avoid storing derived values where possible (e.g. "next service due" should be calculated from mileage + interval, not stored as a fixed value that can go stale)
- Use `timestamptz` (timezone-aware timestamps) consistently — this matters when dealing with scheduled tasks and email triggers

When planning each new stage, review the schema before writing any code.

---

## Live URLs

- **Driver app:** https://weekly-mileage.netlify.app/?vehicle=VH001
- **Admin dashboard:** https://weekly-mileage.netlify.app/admin/

---

## Stack

- **Frontend:** Vanilla JS, Vite (no framework) — current
- **Backend/DB:** Supabase (project: `fleet-mileage-personal`, ID: `xlrtvtqwxyojhvzmsakz`, region: eu-central-2)
- **Storage:** Supabase Storage — buckets: `vehicle-images`, `fault-photos`
- **Deployment:** Netlify (auto-deploys on git push)
- **Fonts:** Barlow + Barlow Condensed (driver app), Syne + DM Mono (admin)
- **Packages:** `@supabase/supabase-js`, `qrcode-generator`, `vite`

### Future stack direction
- The driver-facing screens (mileage entry, inspection forms, fault reporting) will **stay as vanilla JS** — they work perfectly, are fast, and are accessed via QR code with no installation needed
- The **admin/mechanic dashboard** will be rebuilt in **Vue 3 + Vite** as it grows in complexity across Stage 2–4
- Vue was chosen over React after deliberate evaluation — it has a gentler learning curve, its Single File Component structure (HTML, JS, and CSS in one file) is more intuitive for someone coming from a structured programming background, and it is the right fit for a small internal dashboard with no need for React's extra complexity
- Next.js was ruled out — it adds server-side rendering complexity that an internal admin tool simply doesn't need
- Low-code tools (Retool, Budibase, Appsmith) were evaluated and rejected: Retool has vendor lock-in risk as a closed-source commercial product; Budibase has no meaningful free tier; Appsmith requires too much JavaScript for the benefit it provides
- Supabase backend is framework-agnostic and requires no changes regardless of frontend choice

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
└── admin/
    ├── index.html       # Admin dashboard
    ├── admin.js         # Admin logic
    └── admin.css        # Admin styles
```

---

## Supabase schema

### `public.vehicles` *(exists)*
| Column | Type | Notes |
|---|---|---|
| id | text | Primary key, e.g. "VH001" |
| name | text | e.g. "Ford Transit LWB" |
| image_url | text | Path within `vehicle-images` bucket (nullable) |
| current_mileage | integer | Updated on each submission, default 0 |
| plate | text | Registration number |
| make | text | e.g. "Ford" |
| model | text | e.g. "Transit" |
| year | integer | |
| active | boolean | Default true |

### `public.mileage_log` *(exists)*
| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key, auto-generated |
| vehicle_id | text | FK → vehicles.id |
| mileage | integer | |
| submitted_at | timestamptz | Default now() |
| driver_name | text | Nullable |
| notes | text | Nullable |

### `public.faults` *(exists)*
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| vehicle_id | text | FK → vehicles.id |
| reported_at | timestamptz | |
| driver_name | text | Optional — supplied by driver |
| description | text | Auto-generated from fault type + detail selections |
| fault_type | text | 'bulb', 'adblue', 'tyre', 'windscreen', 'damage', 'other' |
| severity | text | 'low', 'normal', 'high', 'critical' |
| photo_url | text | Supabase Storage public URL (fault-photos bucket) |
| damage_location | jsonb | {x, y, view} — percentage position on SVG diagram |
| status | text | 'open', 'in_progress', 'resolved' |
| resolved_at | timestamptz | |
| mechanic_notes | text | |

### `public.known_issues` *(exists — created 2026-04-29)*
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| vehicle_id | text | FK → vehicles.id |
| description | text | The issue note shown to drivers |
| added_by | text | Name of admin/mechanic who added it |
| added_at | timestamptz | Default now() |
| resolved | boolean | Default false — false = visible to drivers |
| resolved_at | timestamptz | Nullable |

RLS: anon users can SELECT where `resolved = false`. Authenticated users have full access.

Known issues are managed from the admin/mechanic dashboard (UI to be built in the Vue 3 rebuild).

### `public.inspections` *(to be created via migration)*
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| vehicle_id | text | FK → vehicles.id |
| inspection_type | text | 'engine' or 'tyre' |
| submitted_at | timestamptz | |
| driver_name | text | |
| oil_level | text | 'ok', 'low', 'critical' |
| coolant_level | text | 'ok', 'low', 'critical' |
| brake_fluid | text | 'ok', 'low', 'critical' |
| tyre_fl_depth | numeric(4,1) | mm — front left |
| tyre_fr_depth | numeric(4,1) | mm — front right |
| tyre_rl_depth | numeric(4,1) | mm — rear left |
| tyre_rr_depth | numeric(4,1) | mm — rear right |
| tyre_pressure_ok | boolean | |
| alert_sent | boolean | Default false |
| notes | text | |

### `public.cleans` *(to be created via migration)*
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| vehicle_id | text | FK → vehicles.id |
| cleaned_at | timestamptz | |
| cleaned_by | text | |
| interior_vacuumed | boolean | |
| windows_cleaned | boolean | |
| dashboard_wiped | boolean | |
| boot_cleared | boolean | |
| exterior_washed | boolean | |
| notes | text | |

### `public.bookings` *(to be created via migration — Stage 4)*
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| vehicle_id | text | FK → vehicles.id |
| driver_name | text | |
| purpose | text | |
| start_date | date | |
| end_date | date | |
| status | text | 'confirmed', 'cancelled' |
| created_at | timestamptz | |

### `public.vehicle_status` *(view — exists)*
A single query view for the mechanic dashboard showing every active vehicle's latest mileage, open fault count, critical fault flag, last clean date, last inspection date, unacknowledged alert flag, and current booking.

### `public.todos`
Unrelated legacy table — dropped by migration script.

---

## How the driver app works

### Choice screen (index.html)
1. URL param `?vehicle=VH001` is read on load
2. Vehicle fetched from Supabase `vehicles` table
3. Vehicle photo, name, and ID displayed
4. Known issues count fetched — badge shown on the Known Issues button if any exist
5. Driver chooses: Submit Mileage, Report a Fault, or Known Issues

### Mileage flow (index.html → screen-app)
1. Previous mileage shown
2. Driver enters new mileage — validated (cannot be less than previous)
3. On confirm: inserts row into `mileage_log`, updates `current_mileage` on vehicle
4. Success screen shown, with back-to-menu button

### Fault reporting (fault-report.html)
1. Driver taps "Report a Fault" → opens `fault-report.html?vehicle=VH001`
2. Six large icon buttons — driver picks the fault category
3. Follow-up detail screen based on category:
   - **Bulb out** — pill selector for which light
   - **AdBlue low** — pill selector for range remaining + optional litres added
   - **Flat/damaged tyre** — pill selector for which tyre
   - **Windscreen chip** — SVG windscreen diagram, driver taps to pin location
   - **Dent/damage** — SVG top-down + side-view diagram with tab toggle, driver taps to pin location
   - **Other** — free-text description field
4. Optional driver name field (applies to all types)
5. Optional photo upload (uses `fault-photos` Supabase Storage bucket)
6. On submit: inserts into `faults` table with `fault_type`, `description`, `damage_location` (jsonb), `photo_url`, `driver_name`

### Known issues (known-issues.html)
1. Fetches all `known_issues` where `resolved = false` for the vehicle
2. If none: shows a green "No Known Issues" confirmation screen
3. If any: lists each issue with description, who logged it, and date
4. Back button returns to choice screen

### How the admin dashboard works
Three tabs:
- **Vehicles** — lists all vehicles, add new vehicle (with photo upload), delete vehicle
- **Mileage** — lists all vehicles with current mileage, click to view full history modal
- **QR Codes** — generates QR codes client-side (canvas), printable

Photo uploads go to Supabase Storage bucket `vehicle-images`. The filename saved is `{id}.{ext}` (e.g. `VH001.jpg`). The `image_url` column stores this path (not the full URL). Signed URLs are generated at runtime for display.

---

## Key decisions & conventions

- Column name is `image_url` (NOT `photo_url`) on `vehicles` — this was a bug fixed on 2026-04-26
- Fault photos use `photo_url` on the `faults` table and the `fault-photos` storage bucket
- Signed URLs used for vehicle photos in admin (expiry: 3600s)
- Driver app uses `current_mileage` field directly from `vehicles` table for the "last recorded" display
- QR codes generated client-side using `qrcode-generator`, rendered to `<canvas>`
- No authentication on the driver app (public, URL-gated by vehicle ID)
- Admin uses magic link authentication via Supabase Auth
- Tyre alert threshold: < 1.6mm (UK legal minimum)
- All costs: £0 — entire stack runs on free tiers (Supabase, Netlify, Gmail SMTP for email)
- `damage_location` stored as jsonb `{x, y, view}` where x/y are percentage positions on the SVG viewBox, and view is 'top', 'side', or 'windscreen'

---

## Email alerts

### Fault report emails (working ✓ — 2026-04-29)
When a driver submits a fault, an email is automatically sent to the fleet mechanic (To) and admin (CC).

**Stack:**
- **Gmail SMTP** — sends via a dedicated fleet Gmail account using an App Password (no domain verification needed)
- **Supabase Edge Function** — `send-fault-email` (deployed at `supabase/functions/send-fault-email/index.ts`) — uses `denomailer@1.6.0` via `smtp.gmail.com:465`
- **Supabase Database Webhook** — `on_fault_inserted` — fires on INSERT to `faults` table, calls the Edge Function

**Config:** Recipient addresses and the Gmail sender address (`gmail_user`) are stored in `public.app_settings`. The Gmail App Password is stored as a Supabase Edge Function secret (`GMAIL_APP_PASSWORD`) — never in code or app_settings.

**From address:** The fleet Gmail account — already trusted by the mechanic from the previous Coda-based system.

**Why Gmail instead of Resend:** Resend requires DNS verification of an owned domain. The fleet Gmail account is already recognised by the mechanic, so switching to Gmail SMTP via App Password was the simpler and more appropriate solution.

**To redeploy the function after any changes:**
```
supabase functions deploy send-fault-email
```

---

## Known issues / bugs fixed

- [FIXED 2026-04-26] `admin.js` used `photo_url` in three places instead of `image_url`:
  - `loadAll()` signed URL condition
  - `deleteVehicle()` storage removal
  - `insert()` when adding a new vehicle

---

## Current status (as of 2026-04-30)

- Driver app choice screen: working ✓
- Mileage submission: working ✓
- Fault reporting: working ✓
- Known issues (driver view): working ✓
- Admin dashboard: working ✓
- 32 vehicles in the database ✓
- Full migration script written and run ✓ — all tables and `vehicle_status` view created
- RLS enabled and policies applied to all tables ✓
- Admin authentication (magic link via Supabase Auth) ✓
- `fault-photos` storage bucket created ✓
- `known_issues` table created ✓ (migration run 2026-04-29)
- `fault_type` and `damage_location` columns added to `faults` table ✓

RLS summary:
- `vehicles`: anon SELECT, authenticated full access
- `mileage_log`: anon INSERT only, authenticated full access
- `inspections`, `cleans`, `faults`: anon INSERT only, authenticated full access
- `bookings`: authenticated only
- `known_issues`: anon SELECT (resolved = false only), authenticated full access

Note: `plate` column exists on `vehicles` but is not yet populated for all 32 vehicles.

---

## Upcoming goals / to-do

- [x] Run the migration script in Supabase SQL Editor
- [x] Enable RLS and apply security policies to all tables
- [x] Add authentication to the admin dashboard
- [x] Create `fault-photos` storage bucket in Supabase
- [x] Build driver-facing fault reporting
- [x] Build driver-facing known issues screen
- [x] Set up fault report email alerts (Edge Function + Resend + Database Webhook)
- [ ] Fill in plate, make, model, year for all 32 vehicles
- [ ] Add Known Issues management UI to the admin/mechanic dashboard (add, resolve issues per vehicle)
- [x] Switch fault email from Resend sandbox to Gmail SMTP via App Password (2026-04-30)
- [ ] Set up email alerts for inspection threshold breaches (reuse send-fault-email pattern)
- [ ] Build Stage 2 driver-facing forms: inspection checklist, deep clean checklist
- [ ] Plan admin dashboard rebuild in Vue 3 + Vite (begin after Stage 2 driver forms are built)

---

## Vue 3 learning notes (added 2026-04-29)

Vue 3 + Vite is the chosen framework for the admin dashboard rebuild. Key mental model mappings for someone with a COBOL/RPG background:

- **Single File Component (SFC)** = a `.vue` file containing three clearly separated sections: `<template>` (the HTML layout), `<script>` (the logic), and `<style>` (the CSS). Like a well-structured report with a layout section, a logic section, and a formatting section — all in one place.
- **Component** = a reusable building block, like a subroutine that returns a piece of the UI. Define it once, use it many times.
- **Props** = parameters passed into a component from its parent. Read-only. Like passing arguments into a subroutine.
- **Reactive data (`ref`, `reactive`)** = working storage that belongs to a component. When it changes, Vue automatically redraws the relevant part of the UI. No manual DOM manipulation needed — equivalent to a report tool that rerenders the template when the data changes.
- **`onMounted`** = code that runs when the component first appears on screen. This is where Supabase queries go — equivalent to OPEN/READ at the start of a program.
- **Directives** = special HTML attributes Vue provides: `v-for` loops over a list (like a DO loop in RPG), `v-if` shows/hides elements conditionally, `v-model` binds a form input to a variable two-ways.

The key shift from vanilla JS: instead of manually finding and updating DOM elements when data changes, you update reactive data and Vue handles the redraw automatically.

---

## Git workflow

```bash
git pull          # start of session
git add .
git commit -m "describe change"
git push          # Netlify auto-deploys
```

---

## Blueprint / reference implementation

Everything this web app needs to do is already working inside Martin's **weekly-mileage Coda doc**. That doc is the blueprint for this project.

- The Coda doc grew in complexity while Martin was learning Coda, so its data structures may not be optimal
- Martin is open to suggestions on how to best structure the Supabase database — don't just mirror the Coda structure blindly
- When planning new features, ask Martin to share the relevant part of the Coda doc (via public link, CSV export, or description) so we can understand the intended behaviour before building
- Coda doc access: no direct MCP connector available — use a public share link, CSV export, or description

---

## About the developer

Martin has a strong background in old-school programming (1980s–2000s) including COBOL, JCL, RPG, OCL, SQL, Crystal Reports, and CorVu B.I. He was away from programming for nearly two decades and restarted his passion about two years ago via Coda.io, and is now building real web apps. He is relatively new to modern web development and is learning as he goes.

**When working with Martin:**
- Explain modern concepts by relating them to familiar ones where possible (e.g. Supabase = managed relational DB with an API layer, not unlike SQL + a report writer but with a web front end)
- Don't assume knowledge of modern jargon — explain terms like "component", "bundle", "environment variable", "npm package", "API", etc. when they come up
- Be clear about the *why* behind things, not just the *how*
- He is comfortable with structured logic, data, and SQL — lean into that
- He uses Claude Desktop with the filesystem MCP and Supabase MCP connectors connected
- GitHub connector is not available — cannot browse repos directly
- Sessions expire frequently mid-task — always write files incrementally and confirm each one before moving to the next where possible

---

## How to start a Claude session

Paste this at the start of each chat:

> "Please read my PROJECT.md at C:\Users\martinreith\Documents\dev\fleet-mileage\PROJECT.md"

Then tell Claude what you want to work on. At the end of the session, ask Claude to update this file with anything that changed.
