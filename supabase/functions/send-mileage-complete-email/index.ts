import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

// Triggered by:
//   (a) a database webhook on INSERT to mileage_log, OR
//   (b) a direct POST from the admin UI "Close Week" button
//       with body { fleet_week, fleet_year } when out vehicles exist.
//
// Checks whether all applicable vehicles for the fleet week are either:
//   - collected (row in mileage_log), OR
//   - skipped   (row in mileage_collection_skips)
// If so, sends the summary email and records the alert.
//
// Fleet week = ISO week of (submitted_at - 1 day).
// Even fleet-weeks = 32 vehicles; odd = 28 (fortnightly vehicles skipped).
// NOTE: active = false vehicles are excluded from the applicable list —
// they are treated as "out" and do not count toward the completion total.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const body = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── 1. Work out the fleet week ────────────────────────────────────────────
    // If called directly from admin UI, body contains { fleet_week, fleet_year }.
    // If called from webhook, body contains { record: { submitted_at, ... } }.
    let fleetWeek: number;
    let fleetYear: number;

    if (body.fleet_week && body.fleet_year) {
      fleetWeek = body.fleet_week;
      fleetYear = body.fleet_year;
    } else {
      const record = body.record;
      if (!record) return new Response("No record in payload", { status: 400, headers: CORS_HEADERS });
      const submittedAt = new Date(record.submitted_at ?? new Date().toISOString());
      const offsetDate  = new Date(submittedAt.getTime() - 86400000);
      const iw = isoWeek(offsetDate);
      fleetWeek = iw.week;
      fleetYear = iw.year;
    }

    const fullWeek = fleetWeek % 2 === 0;

    // ── 2. Check if alert already sent for this week ──────────────────────────
    const { data: existing } = await supabase
      .from("mileage_collection_alerts")
      .select("id")
      .eq("fleet_week", fleetWeek)
      .eq("fleet_year", fleetYear)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ skipped: "alert already sent" }), {
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    // ── 3. Calculate collection window: Friday of fleet week ─────────────────
    const jan4       = new Date(Date.UTC(fleetYear, 0, 4));
    const startWeek1 = new Date(jan4);
    startWeek1.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7));
    const monday = new Date(startWeek1);
    monday.setUTCDate(startWeek1.getUTCDate() + (fleetWeek - 1) * 7);
    const friday = new Date(monday);
    friday.setUTCDate(monday.getUTCDate() + 4);

    // ── 4. Fetch all applicable vehicles (active only) ────────────────────────
    // active = false means the vehicle is currently "out" and not part of
    // this week's collection. We exclude them from the denominator entirely
    // so the completion check works correctly without needing skip rows.
    const { data: vehicles, error: vErr } = await supabase
      .from("vehicles")
      .select("id, name, plate, current_mileage, collection_frequency")
      .eq("active", true)
      .order("id");

    if (vErr) throw vErr;

    const applicable = (vehicles ?? []).filter(
      (v: { collection_frequency: string }) =>
        v.collection_frequency === "weekly" || fullWeek
    );

    // ── 5. Fetch mileage submissions for this fleet week ──────────────────────
    const { data: submissions, error: sErr } = await supabase
      .from("mileage_log")
      .select("vehicle_id, mileage, submitted_at, driver_name")
      .gte("submitted_at", friday.toISOString())
      .order("submitted_at", { ascending: false });

    if (sErr) throw sErr;

    const doneMap: Record<string, { mileage: number; submitted_at: string; driver_name: string | null }> = {};
    for (const row of (submissions ?? [])) {
      const rowOffset = new Date(new Date(row.submitted_at).getTime() - 86400000);
      const { week: rw, year: ry } = isoWeek(rowOffset);
      if (rw === fleetWeek && ry === fleetYear && !doneMap[row.vehicle_id]) {
        doneMap[row.vehicle_id] = row;
      }
    }

    // ── 6. Fetch skipped vehicles for this fleet week ─────────────────────────
    const { data: skips, error: skErr } = await supabase
      .from("mileage_collection_skips")
      .select("vehicle_id")
      .eq("fleet_week", fleetWeek)
      .eq("fleet_year", fleetYear);

    if (skErr) throw skErr;

    const skippedIds = new Set((skips ?? []).map((s: { vehicle_id: string }) => s.vehicle_id));

    const accounted = applicable.filter(
      (v: { id: string }) => doneMap[v.id] || skippedIds.has(v.id)
    ).length;

    // ── 7. Not complete yet — nothing to do ──────────────────────────────────
    if (accounted < applicable.length) {
      return new Response(
        JSON.stringify({ pending: applicable.length - accounted }),
        { headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
      );
    }

    // ── 8. All accounted for — record the alert first (prevents race condition)
    const { error: insertErr } = await supabase
      .from("mileage_collection_alerts")
      .insert({ fleet_week: fleetWeek, fleet_year: fleetYear, vehicle_count: applicable.length });

    if (insertErr) {
      if (insertErr.code === "23505") {
        return new Response(JSON.stringify({ skipped: "race condition — already recorded" }), {
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        });
      }
      throw insertErr;
    }

    // ── 9. Fetch email config ─────────────────────────────────────────────────
    const { data: settings } = await supabase
      .from("app_settings")
      .select("key, value");

    const config: Record<string, string> = {};
    for (const row of (settings ?? [])) config[row.key] = row.value;

    const mechanicEmail    = config["mechanic_email"];
    const adminEmail       = config["admin_email"];
    const gmailUser        = config["gmail_user"];
    const gmailAppPassword = Deno.env.get("GMAIL_APP_PASSWORD");

    if (!mechanicEmail || !adminEmail || !gmailUser || !gmailAppPassword) {
      throw new Error("Missing email config in app_settings or GMAIL_APP_PASSWORD secret");
    }

    // ── 10. Build email content ───────────────────────────────────────────────
    const completedAt = new Date().toLocaleString("en-GB", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: "Europe/London",
    });

    const collectedCount = applicable.filter((v: { id: string }) => doneMap[v.id]).length;
    const skippedCount   = skippedIds.size;

    const rows = applicable
      .map((v: { id: string; name: string; plate: string; current_mileage: number | null }) => {
        const isSkipped = skippedIds.has(v.id);
        return {
          plate:     v.plate,
          name:      v.name,
          mileage:   isSkipped ? null : (doneMap[v.id]?.mileage ?? v.current_mileage ?? 0),
          time:      isSkipped ? 'Vehicle out' : (
            doneMap[v.id]?.submitted_at
              ? new Date(doneMap[v.id].submitted_at).toLocaleString("en-GB", {
                  day: "2-digit", month: "short",
                  hour: "2-digit", minute: "2-digit",
                  timeZone: "Europe/London",
                })
              : "—"
          ),
          skipped: isSkipped,
        };
      })
      .sort((a: { plate: string }, b: { plate: string }) => a.plate.localeCompare(b.plate));

    const tableRows = rows.map((r: { plate: string; name: string; mileage: number | null; time: string; skipped: boolean }) => `
      <tr style="${r.skipped ? 'color:#aaa;' : ''}">
        <td style="padding:5px 14px 5px 0;font-weight:600;color:${r.skipped ? '#ccc' : '#f0a500'};">${r.plate}</td>
        <td style="padding:5px 14px 5px 0;">${r.name}</td>
        <td style="padding:5px 14px 5px 0;text-align:right;">${r.skipped ? '—' : r.mileage!.toLocaleString("en-GB") + ' mi'}</td>
        <td style="padding:5px 0;color:#888;font-size:13px;font-style:${r.skipped ? 'italic' : 'normal'};">${r.time}</td>
      </tr>
    `).join("");

    const skippedNote = skippedCount > 0
      ? `<p style="color:#d97706;margin-top:0.5rem;">&#x26A0;&#xFE0F; ${skippedCount} vehicle${skippedCount > 1 ? 's were' : ' was'} out and not collected this week.</p>`
      : '';

    const subject = `✅ Week ${fleetWeek} Mileage Collection Complete — ${collectedCount} collected, ${skippedCount} out`;

    const emailHtml = `
      <div style="font-family:sans-serif;max-width:600px;">
        <h2 style="color:#2e7d32;">&#x2705; Week ${fleetWeek} Mileage Collection Complete</h2>
        <p style="color:#555;">${collectedCount} vehicles collected, ${skippedCount} vehicle${skippedCount !== 1 ? 's' : ''} out.<br>
        Completed: <strong>${completedAt}</strong></p>
        ${skippedNote}

        <table style="border-collapse:collapse;font-size:14px;width:100%;margin-top:1rem;">
          <thead>
            <tr style="border-bottom:2px solid #eee;">
              <th style="padding:6px 14px 6px 0;text-align:left;color:#888;font-weight:600;">Plate</th>
              <th style="padding:6px 14px 6px 0;text-align:left;color:#888;font-weight:600;">Vehicle</th>
              <th style="padding:6px 14px 6px 0;text-align:right;color:#888;font-weight:600;">Mileage</th>
              <th style="padding:6px 0;text-align:left;color:#888;font-weight:600;">Recorded</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <hr style="margin-top:24px;border:none;border-top:1px solid #eee;">
        <p style="font-size:12px;color:#aaa;">Automated alert from the Fleet Mileage app.</p>
      </div>
    `;

    // ── 11. Send via Gmail SMTP ───────────────────────────────────────────────
    const client = new SMTPClient({
      connection: {
        hostname: "smtp.gmail.com",
        port: 465,
        tls: true,
        auth: { username: gmailUser, password: gmailAppPassword },
      },
    });

    await client.send({
      from:    `Fleet Alerts <${gmailUser}>`,
      to:      mechanicEmail,
      cc:      adminEmail,
      subject,
      html:    emailHtml,
      content: emailHtml,
    });

    await client.close();

    return new Response(
      JSON.stringify({ success: true, week: fleetWeek, collected: collectedCount, skipped: skippedCount }),
      { headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );

  } catch (err) {
    console.error("send-mileage-complete-email error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
});

// ── ISO week helper ───────────────────────────────────────────────────────
function isoWeek(d: Date): { week: number; year: number } {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { week, year: date.getUTCFullYear() };
}
