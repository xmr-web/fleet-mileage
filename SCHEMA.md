# Fleet Mileage — Supabase Schema Reference

> This file contains the full database schema.
> See PROJECT.md for stack, conventions, decisions, and workflow.
> Update this file whenever a migration is applied.

---

## Schema design principles

- No stored derived values — calculate "next due" at query time from last completion + interval
- Use `timestamptz` throughout — never bare `timestamp`
- Task-specific data stored as JSONB in `maintenance_log` — keeps the table unified while allowing per-task flexibility
- Not every vehicle has every task type in `task_rules` — absence of a row means the task does not apply to that vehicle

---

## Tables

### `public.vehicles` *(exists)*
| Column | Type | Notes |
|---|---|---|
| id | text | Primary key, e.g. "V001" |
| name | text | e.g. "Blue Caddy" |
| image_url | text | Plain filename within `vehicle-images` bucket (nullable) |
| current_mileage | integer | Updated on each mileage submission, default 0 |
| plate | text | Registration number — all 32 vehicles populated ✓ |
| make | text | Lowercase in Supabase — no double-quotes needed in SQL |
| model | text | Lowercase in Supabase |
| year | integer | Lowercase in Supabase |
| active | boolean | Default true |
| adblue_unit | text | 'litres' or 'gallons' — nullable. Null = no AdBlue system (electric or older vehicle). All 32 vehicles populated ✓. Added 2026-05-02. |
| collection_frequency | text | 'weekly' or 'fortnightly'. Default 'weekly'. Controls whether vehicle appears on mileage pending list every week or every other week. Added 2026-05-03. |

**Fortnightly vehicles (collect on even ISO fleet-weeks only):**
- V012 Jetta (FT12)
- V028 RAV 4 (CE62)
- V029 Silver Caddy (RF58)
- V032 Dump Truck (CN10)

**Collection week logic:**
- Fleet week = `EXTRACT(week FROM now() - interval '1 day')` — the -1 day offset means Monday morning still counts as the previous week, matching the Friday–Monday collection window.
- All 32 vehicles collected on even fleet-weeks. 28 vehicles (weekly only) collected on odd fleet-weeks.
- Even week = `MOD(fleet_week::integer, 2) = 0`

**AdBlue unit values by vehicle — confirmed 2026-05-03:**
- litres: V001, V002, V003, V007, V008, V009, V013, V015, V016, V018, V019, V022, V023, V030, V031
- gallons: V020, V021, V026
- null (no AdBlue): all remaining vehicles (electric or older)

---

### `public.mileage_log` *(exists)*
| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key, auto-generated |
| vehicle_id | text | FK → vehicles.id |
| mileage | integer | |
| submitted_at | timestamptz | Default now() |
| driver_name | text | Nullable. 'Garage' for garage assistant entries; null for driver app entries until driver name capture is added. Added 2026-05-03. |
| notes | text | Nullable |

RLS: anon INSERT + anon SELECT, authenticated full access.

---

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

RLS: anon INSERT only, authenticated full access.

---

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

RLS: anon SELECT where `resolved = false` only. Authenticated full access.

---

### `public.maintenance_log` *(exists — created 2026-05-02)*

Unified history table for all maintenance task types. Replaces the previously planned separate `inspections` and `cleans` tables.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK, auto-generated |
| vehicle_id | text | FK → vehicles.id |
| record_type | text | 'engine_check', 'tyre_check', 'adblue_check', 'clean', 'light_check' |
| submitted_at | timestamptz | Default now() |
| submitted_by | text | Driver or admin name |
| mileage_at_check | integer | Odometer reading at time of submission |
| data | jsonb | Task-specific fields (see shapes below) |
| alert_sent | boolean | Default false — set true once threshold breach email is sent |

**JSONB `data` shapes by `record_type`:**

```json
// engine_check
// Fluid levels: integer 0–10.
// 0 = manufacturer minimum reached (vehicle warning light territory).
// 5 = midpoint between min and max marks. 10 = full.
// Alert thresholds: oil <= 5, brake_fluid <= 3, coolant = 0.
{ "oil_level": 5, "coolant_level": 7, "brake_fluid": 8 }

// tyre_check
// Depths in mm. Alert threshold read from app_settings: tyre_depth_alert_mm (default 3.0mm).
// UK legal minimum is 1.6mm — alert fires well before that.
// Pressure in psi, one reading per wheel — stored for history/trend visibility.
// Expected pressures per vehicle stored in vehicle_tyre_specs table.
// No automated pressure-drop alert — handled manually if needed.
{ "fl_depth": 4.2, "fr_depth": 3.8, "rl_depth": 2.1, "rr_depth": 1.9,
  "fl_psi": 34, "fr_psi": 35, "rl_psi": 33, "rr_psi": 34 }

// adblue_check
// range_miles: exact figure from dashboard display. Alert threshold: < 1,000 miles.
// tank_space_litres: exact figure from dashboard display — nullable (some vehicles don't show it).
{ "range_miles": 847, "tank_space_litres": 9.0 }

// clean — checklist of what was completed in the session
{ "interior_vacuumed": true, "windows_cleaned": true, "dashboard_wiped": false, "boot_cleared": false, "exterior_washed": false }

// light_check — pass/fail per cluster. Alert fires if any field = false.
{ "headlights": true, "tail_lights": true, "indicators": true, "brake_lights": true, "reverse_lights": true }
```

RLS: anon INSERT (garage assistant submits via admin interface — NOT drivers via QR), anon SELECT (admin dashboard reads).

---

### `public.alert_thresholds` *(exists — created 2026-05-05)*

Stores configurable alert thresholds. Editable via the admin web interface — never hardcoded in source code.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| record_type | text | Matches maintenance_log.record_type |
| metric | text | Unique. e.g. 'tyre_depth_min', 'oil_level_min' |
| threshold_value | numeric | The value that triggers an alert or warning |
| label | text | Human-readable label for the admin UI |
| sends_email | boolean | true = alert email fired when threshold breached; false = screen warning only |
| updated_at | timestamptz | Default now() |

**Known thresholds (default values):**
| metric | default | notes |
|---|---|---|
| tyre_depth_min | 1.6 | UK legal minimum (mm) — triggers alert email |
| oil_level_min | 5 | Out of 10 — triggers alert email |
| coolant_level_min | 3 | Out of 10 — screen warning only, no email |
| brake_fluid_min | 3 | Out of 10 — triggers alert email |
| adblue_range_warning | 1500 | Miles — amber warning only, no email |
| adblue_range_critical | 1000 | Miles — triggers alert email |
| adblue_range_urgent | 500 | Miles — red display only, no second email |

RLS: anon SELECT (admin dashboard reads thresholds to display gauges), authenticated UPDATE (admin adjusts via UI).

---

### `public.task_rules` *(exists — created 2026-05-02)*

One row per vehicle per task type. Controls scheduling. Not every vehicle has every task type.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| vehicle_id | text | FK → vehicles.id |
| record_type | text | Matches maintenance_log.record_type |
| interval_days | integer | Nullable — null = no time-based schedule |
| interval_miles | integer | Nullable — null = no mileage-based schedule |
| enabled | boolean | Default true — false temporarily disables task for this vehicle |

Unique constraint on `(vehicle_id, record_type)`.

**Intervals and scope — confirmed 2026-05-03:**

| record_type | interval_days | interval_miles | Which vehicles |
|---|---|---|---|
| engine_check | 14 | null | All 32 |
| tyre_check | 28 | null | All 32 |
| adblue_check | 14 | null | 18 AdBlue vehicles only (adblue_unit IS NOT NULL) |
| clean | null | null | All 32 — log only, never flagged overdue |
| light_check | 30 | null | 7 vehicles: V015, V018, V019, V022, V023, V027, V028 (Ford, Toyota, Renault) |

No-AdBlue vehicles have no `adblue_check` row — absence means task does not apply (not the same as `enabled = false`).

RLS: anon SELECT + anon UPDATE (admin can adjust intervals and toggle enabled flag).

---

### `public.vehicle_tyre_specs` *(exists — created 2026-05-05)*

Stores expected tyre pressures per vehicle. Used for reference on the admin dashboard.
No automated alert logic — pressure history is visible per wheel in `maintenance_log`.

| Column | Type | Notes |
|---|---|---|
| vehicle_id | text | PK, FK → vehicles.id |
| front_psi | integer | Expected front tyre pressure in psi |
| rear_psi | integer | Nullable — if null, rear pressure is same as front |

RLS: anon SELECT. Populated and maintained via Supabase dashboard.

---

### `public.app_settings` *(exists)*

Key/value config table. Read by edge functions at runtime.

| Key | Value | Notes |
|---|---|---|
| mechanic_email | — | Fault/alert email recipient (TO) |
| admin_email | — | Fault/alert email recipient (CC) |
| gmail_user | — | Gmail sender address |
| tyre_depth_alert_mm | 3.0 | Tread depth alert threshold in mm — adjustable without code change |

---

### `public.bookings` *(planned — Stage 4)*
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

RLS: authenticated only.

---

### `public.vehicle_status` *(view — rebuilt 2026-05-05)*

Single-query view for the admin/mechanic dashboard. One row per active vehicle.

| Column | Type | Notes |
|---|---|---|
| id | text | vehicles.id |
| name | text | |
| plate | text | |
| current_mileage | integer | |
| last_mileage_date | timestamptz | Most recent mileage_log entry |
| open_faults | bigint | Count of faults where status = 'open' |
| has_critical_fault | boolean | true if any open fault has severity = 'critical' |
| last_clean_date | timestamptz | Most recent maintenance_log entry with record_type = 'clean' |
| last_engine_check_date | timestamptz | Most recent engine_check |
| last_tyre_check_date | timestamptz | Most recent tyre_check |
| has_unacknowledged_alert | boolean | true if any maintenance_log row for this vehicle has alert_sent = true |

Previous version referenced legacy `cleans` and `inspections` tables — rebuilt 2026-05-05 to use `maintenance_log`.

---

### `public.mileage_collection_alerts` *(exists)*

Duplicate-prevention log for the weekly mileage complete email. One row inserted per fleet week once the alert has fired.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| fleet_week | integer | ISO week number |
| fleet_year | integer | |
| sent_at | timestamptz | Default now() |
| vehicle_count | integer | Number of applicable vehicles that week |

Unique constraint on `(fleet_week, fleet_year)` — prevents race-condition double-send.
Inserted by `send-mileage-complete-email` edge function once all vehicles for the week are accounted for.

---

### Legacy tables *(dropped 2026-05-05)*

| Table | Reason |
|---|---|
| todos | Never used in production |
| cleans | Superseded by maintenance_log (record_type = 'clean') |
| inspections | Superseded by maintenance_log (record_type = 'engine_check' / 'tyre_check') |

---

## RLS summary

| Table | anon SELECT | anon INSERT | anon UPDATE | Notes |
|---|---|---|---|---|
| vehicles | ✓ | — | ✓ (active only) | anon UPDATE added 2026-05-04 for Vehicle Out feature |
| mileage_log | ✓ | ✓ | — | |
| faults | — | ✓ | — | Admin reads via authenticated role |
| known_issues | ✓ (resolved=false) | — | — | |
| maintenance_log | ✓ | ✓ | — | |
| task_rules | ✓ | — | ✓ | Admin adjusts intervals |
| vehicle_tyre_specs | ✓ | — | — | Populated via Supabase dashboard only |
| mileage_collection_alerts | ✓ | ✓ | — | Written by send-mileage-complete-email edge function |
| mileage_collection_skips | ✓ | ✓ | ✓ | anon UPDATE needed for upsert/ignoreDuplicates pattern |
| bookings | — | — | — | Authenticated only |

---

## Migrations applied

| Version | Name | Date | Summary |
|---|---|---|---|
| 20260429085718 | rls_policies | 2026-04-29 | Initial RLS policies |
| 20260429103431 | create_known_issues | 2026-04-29 | known_issues table |
| 20260430205015 | create_bulb_types | 2026-04-30 | Bulb types reference data |
| 20260502145709 | anon_select_mileage_log | 2026-05-02 | anon SELECT policy on mileage_log |
| 20260503xxxxxx | stage2_maintenance_schema | 2026-05-03 | maintenance_log, task_rules, adblue_unit on vehicles |
| 20260503xxxxxx | stage2_seed_task_rules | 2026-05-03 | 128 default task_rules rows seeded |
| 20260503xxxxxx | stage2_rls_policies | 2026-05-03 | RLS for maintenance_log and task_rules |
| 20260503xxxxxx | stage2_add_light_check | 2026-05-03 | light_check added to CHECK constraints |
| 20260503xxxxxx | stage2_seed_light_check_rules | 2026-05-03 | light_check seeded for 7 vehicles |
| 20260503xxxxxx | stage2_fix_no_adblue_vehicles | 2026-05-03 | V027 adblue_unit corrected to null; adblue_check removed for 14 no-AdBlue vehicles |
| 20260504xxxxxx | add_unique_constraint_mileage_collection_skips | 2026-05-04 | Unique constraint on (fleet_week, fleet_year, vehicle_id) |
| 20260504xxxxxx | anon_update_mileage_collection_skips | 2026-05-04 | anon UPDATE policy on mileage_collection_skips for upsert ignoreDuplicates |
| 20260505xxxxxx | create_alert_thresholds | 2026-05-05 | alert_thresholds table created, seeded with 7 default thresholds, RLS applied |
| 20260505xxxxxx | create_vehicle_tyre_specs | 2026-05-05 | vehicle_tyre_specs table with anon SELECT RLS |
| 20260505xxxxxx | seed_maintenance_alert_thresholds | 2026-05-05 | tyre_depth_alert_mm = 3.0 added to app_settings |
| 20260505xxxxxx | drop_legacy_tables_rebuild_vehicle_status | 2026-05-05 | Dropped todos, cleans, inspections; rebuilt vehicle_status view against maintenance_log |
