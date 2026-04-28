# Fleet Mileage — Project Context

> Read this at the start of every Claude session to get up to speed instantly.
> Update this file at the end of each session with any changes, decisions, or new goals.

---

## What the app is

A mobile-first fleet management platform built around QR codes. Each vehicle gets a unique QR code that opens the app pre-loaded with that vehicle's details. Drivers use the app to submit mileage, report faults, and complete inspection checklists. A separate admin/mechanic dashboard provides oversight of the full fleet.

---

## Product vision — 4-stage roadmap

### Stage 1 — Mileage collection & reporting *(current — working)*
- Drivers submit odometer readings via QR-code-linked mobile app
- Admin dashboard shows current mileage per vehicle and full submission history
- Reporting on mileage over time per vehicle

### Stage 2 — Scheduled maintenance & automated alerts *(next)*
- Fortnightly engine and tyre checks submitted via QR code by drivers
- Automatic email to fleet mechanic when thresholds are breached (e.g. tyre depth < 1.6mm, oil level critical)
- Monthly deep clean checklist with cleaning history per vehicle
- Admin can manage task schedules, mechanics, and notification rules

### Stage 3 — Driver fault reports
- Drivers can submit fault/defect reports against a vehicle directly from the app
- Optional photo upload
- Faults logged with date, vehicle, driver, description, and severity
- Mechanic dashboard shows open faults, status workflow (open → in_progress → resolved)

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
- **Storage:** Supabase Storage — bucket: `vehicle-images`
- **Deployment:** Netlify (auto-deploys on git push)
- **Fonts:** Barlow + Barlow Condensed (driver app), Syne + DM Mono (admin)
- **Packages:** `@supabase/supabase-js`, `qrcode-generator`, `vite`

### Future stack direction (agreed 2026-04-28)
- The driver-facing screens (mileage entry, inspection forms, fault reporting) will **stay as vanilla JS** — they work perfectly, are fast, and are accessed via QR code with no installation needed
- The **admin/mechanic dashboard** will eventually be rebuilt in **React + Next.js + Tailwind + shadcn/ui** as it grows in complexity across Stage 2–4
- This rebuild will happen **after** Martin has learned React basics separately — not by rewriting the existing working app
- Supabase backend is framework-agnostic and requires no changes regardless of frontend choice
- React learning path: react.dev/learn tutorial first → Scrimba free React course → build a single VehicleCard component against real Supabase data as a practice exercise → then tackle admin rebuild

---

## File structure

```
fleet-mileage/
├── index.html          # Driver-facing mileage entry app
├── main.js             # Driver app logic
├── style.css           # Driver app styles
├── supabase.config.js  # Supabase credentials (URL + anon key)
├── vite.config.js
├── package.json
├── README.md
├── SETUP.md
└── admin/
    ├── index.html      # Admin dashboard
    ├── admin.js        # Admin logic
    └── admin.css       # Admin styles
```

---

## Supabase schema

### `public.vehicles` *(exists — needs new columns added via migration)*
| Column | Type | Notes |
|---|---|---|
| id | text | Primary key, e.g. "VH001" |
| name | text | e.g. "Ford Transit LWB" |
| image_url | text | Path within `vehicle-images` bucket (nullable) |
| current_mileage | integer | Updated on each submission, default 0 |
| plate | text | Registration number — add via migration |
| make | text | e.g. "Ford" — add via migration |
| model | text | e.g. "Transit" — add via migration |
| year | integer | add via migration |
| active | boolean | Default true — add via migration |

### `public.mileage_log` *(exists — needs new columns added via migration)*
| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key, auto-generated |
| vehicle_id | text | FK → vehicles.id |
| mileage | integer | |
| submitted_at | timestamptz | Default now() |
| driver_name | text | Nullable — add via migration |
| notes | text | Nullable — add via migration |

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

### `public.faults` *(to be created via migration)*
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| vehicle_id | text | FK → vehicles.id |
| reported_at | timestamptz | |
| driver_name | text | |
| description | text | |
| severity | text | 'low', 'normal', 'high', 'critical' |
| photo_url | text | Supabase Storage public URL |
| status | text | 'open', 'in_progress', 'resolved' |
| resolved_at | timestamptz | |
| mechanic_notes | text | |

### `public.bookings` *(to be created via migration — Stage 4, UI to be built later)*
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

### `public.vehicle_status` *(view — to be created via migration)*
A single query view for the mechanic dashboard showing every active vehicle's latest mileage, open fault count, critical fault flag, last clean date, last inspection date, unacknowledged alert flag, and current booking.

### `public.todos`
Unrelated legacy table — dropped by migration script.

---

## Migration script

A full migration script has been written and is ready to paste into the Supabase SQL Editor.
Location: provided as a download in the 2026-04-28 Claude session.

The script:
- Drops `todos`
- Adds new columns to `vehicles` and `mileage_log`
- Creates `inspections`, `cleans`, `faults`, `bookings` tables
- Creates the `vehicle_status` view
- Sets up Row Level Security (RLS) policies:
  - Drivers (anon key, via QR code) can INSERT but not SELECT
  - Mechanic (authenticated login) can SELECT and UPDATE everything

**Still to do after running migration:**
- Fill in `plate`, `make`, `model`, `year` for the 32 vehicles
- Create a Supabase Storage bucket named `fault-photos` for fault photo uploads
- Set up Supabase Edge Function for inspection threshold email alerts (next major task)

---

## How the driver app works

1. URL param `?vehicle=VH001` is read on load
2. Vehicle fetched from Supabase `vehicles` table
3. Vehicle photo, name, ID, and last mileage displayed
4. Driver enters new mileage — validated (cannot be less than previous)
5. On confirm: inserts row into `mileage_log`, updates `current_mileage` on vehicle
6. Success screen shown

## How the admin dashboard works

Three tabs:
- **Vehicles** — lists all vehicles, add new vehicle (with photo upload), delete vehicle
- **Mileage** — lists all vehicles with current mileage, click to view full history modal
- **QR Codes** — generates QR codes client-side (canvas), printable

Photo uploads go to Supabase Storage bucket `vehicle-images`. The filename saved is `{id}.{ext}` (e.g. `VH001.jpg`). The `image_url` column stores this path (not the full URL). Signed URLs are generated at runtime for display.

---

## Key decisions & conventions

- Column name is `image_url` (NOT `photo_url`) — this was a bug that was fixed on 2026-04-26
- Signed URLs used for vehicle photos in admin (expiry: 3600s)
- Driver app uses `current_mileage` field directly from `vehicles` table for the "last recorded" display
- QR codes generated client-side using `qrcode-generator`, rendered to `<canvas>`
- No authentication on the driver app (public, URL-gated by vehicle ID)
- Admin has no authentication currently (adding auth is next on the to-do list)
- Tyre alert threshold: < 1.6mm (UK legal minimum)
- All costs: £0 — entire stack runs on free tiers (Supabase, Netlify, Resend for email)

---

## Known issues / bugs fixed

- [FIXED 2026-04-26] `admin.js` used `photo_url` in three places instead of `image_url`:
  - `loadAll()` signed URL condition
  - `deleteVehicle()` storage removal
  - `insert()` when adding a new vehicle

---

## Current status (as of 2026-04-28)

- Driver app: working ✓
- Admin dashboard: working ✓
- 32 vehicles in the database ✓
- Full migration script written and ready to run ✓
- React learning path agreed — not yet started

---

## Upcoming goals / to-do

- [ ] Run the migration script in Supabase SQL Editor
- [ ] Fill in plate, make, model, year for all 32 vehicles
- [ ] Create `fault-photos` storage bucket in Supabase
- [ ] Add authentication to the admin dashboard
- [ ] Set up Supabase Edge Function for inspection email alerts (Resend recommended for email delivery)
- [ ] Build Stage 2 driver-facing forms: inspection checklist, deep clean checklist
- [ ] Work through React tutorial at react.dev/learn
- [ ] Build practice VehicleCard React component against real Supabase data
- [ ] Plan admin dashboard rebuild in Next.js + React + Tailwind + shadcn/ui

---

## React learning notes (added 2026-04-28)

Martin is learning React. Key mental model mappings for someone with a COBOL/RPG background:

- **Component** = a subroutine that returns HTML. Defined once, reused many times. Like a report detail-line template.
- **Props** = parameters passed into a component. Read-only. Like passing arguments to a subroutine.
- **State (`useState`)** = working storage that belongs to a component. When it changes, React redraws the component automatically. No manual DOM manipulation needed.
- **`useEffect`** = code that runs when the component first appears or when something changes. This is where Supabase queries go — equivalent to OPEN/READ at the start of a program.

The key shift from vanilla JS: instead of manually finding and updating DOM elements when data changes, you update state and React handles the redraw. Like a report tool that rerenders the template automatically when the data changes.

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

---

## How to start a Claude session

Paste this at the start of each chat:

> "Please read my PROJECT.md at C:\Users\martinreith\Documents\dev\fleet-mileage\PROJECT.md"

Then tell Claude what you want to work on. At the end of the session, ask Claude to update this file with anything that changed.
