import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    // --- 1. Parse webhook payload ---
    const payload = await req.json();
    const record = payload.record;

    if (!record) {
      return new Response("No record in payload", { status: 400 });
    }

    // Clean records never trigger alerts
    if (record.record_type === "clean") {
      return new Response(JSON.stringify({ skipped: "clean" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // --- 2. Connect to Supabase ---
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // --- 3. Fetch config from app_settings ---
    const { data: settings, error: settingsError } = await supabase
      .from("app_settings")
      .select("key, value");
    if (settingsError) throw settingsError;

    const config: Record<string, string> = {};
    for (const row of settings) config[row.key] = row.value;

    const mechanicEmail  = config["mechanic_email"];
    const adminEmail     = config["admin_email"];
    const gmailUser      = config["gmail_user"];
    const tyreDepthAlert = parseFloat(config["tyre_depth_alert_mm"] ?? "3.0");

    if (!mechanicEmail || !adminEmail || !gmailUser) {
      throw new Error("Missing required config in app_settings");
    }

    const gmailAppPassword = Deno.env.get("GMAIL_APP_PASSWORD");
    if (!gmailAppPassword) throw new Error("Missing GMAIL_APP_PASSWORD secret");

    // --- 4. Fetch vehicle name and plate ---
    const { data: vehicle } = await supabase
      .from("vehicles")
      .select("name, plate")
      .eq("id", record.vehicle_id)
      .single();

    const vehicleLabel = vehicle
      ? vehicle.name + (vehicle.plate ? " (" + vehicle.plate + ")" : "")
      : record.vehicle_id;

    // --- 5. Check for threshold breaches ---
    const breaches: string[] = [];
    const data = record.data ?? {};

    if (record.record_type === "engine_check") {
      // 0 = manufacturer minimum reached for all fluids
      // Oil: alert at <= 5
      if (typeof data.oil_level === "number" && data.oil_level <= 5) {
        breaches.push("Oil level: " + data.oil_level + "/10 (threshold: <= 5)");
      }
      // Brake fluid: alert at <= 3
      if (typeof data.brake_fluid === "number" && data.brake_fluid <= 3) {
        breaches.push("Brake fluid: " + data.brake_fluid + "/10 (threshold: <= 3)");
      }
      // Coolant: alert only at 0 (vehicle warning light will flag anything below min)
      if (typeof data.coolant_level === "number" && data.coolant_level === 0) {
        breaches.push("Coolant: 0/10 — at manufacturer minimum");
      }
    }

    if (record.record_type === "tyre_check") {
      // Tread depth threshold read from app_settings (default 3.0mm)
      const wheels: Array<[string, string]> = [
        ["fl_depth", "Front Left"],
        ["fr_depth", "Front Right"],
        ["rl_depth", "Rear Left"],
        ["rr_depth", "Rear Right"],
      ];
      for (const [key, label] of wheels) {
        const depth = data[key];
        if (typeof depth === "number" && depth < tyreDepthAlert) {
          breaches.push(label + " tread: " + depth + "mm (threshold: < " + tyreDepthAlert + "mm)");
        }
      }
    }

    if (record.record_type === "adblue_check") {
      // Garage action threshold: 1,000 miles
      if (typeof data.range_miles === "number" && data.range_miles < 1000) {
        breaches.push("AdBlue range: " + data.range_miles + " miles (threshold: < 1,000 miles)");
      }
    }

    if (record.record_type === "light_check") {
      const lights: Array<[string, string]> = [
        ["headlights",     "Headlights"],
        ["tail_lights",    "Tail lights"],
        ["indicators",     "Indicators"],
        ["brake_lights",   "Brake lights"],
        ["reverse_lights", "Reverse lights"],
      ];
      for (const [key, label] of lights) {
        if (data[key] === false) {
          breaches.push(label + ": FAIL");
        }
      }
    }

    // No breaches — nothing to send
    if (breaches.length === 0) {
      return new Response(JSON.stringify({ skipped: "no_breaches" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // --- 6. Mark alert_sent = true on the log row ---
    await supabase
      .from("maintenance_log")
      .update({ alert_sent: true })
      .eq("id", record.id);

    // --- 7. Build email ---
    const recordTypeLabels: Record<string, string> = {
      engine_check: "Engine Check",
      tyre_check:   "Tyre Check",
      adblue_check: "AdBlue Check",
      light_check:  "Light Check",
    };
    const recordTypeLabel = recordTypeLabels[record.record_type] ?? record.record_type;

    const submittedAt = new Date(record.submitted_at).toLocaleString("en-GB", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: "Europe/London",
    });

    const breachRows = breaches
      .map((b) => "<tr><td style='padding:5px 16px 5px 0;color:#c0392b;'>&#9888;</td><td style='padding:5px 0;'>" + b + "</td></tr>")
      .join("");

    const emailHtml =
      "<h2 style='color:#c0392b;'>&#9888;&#65039; Maintenance Alert &mdash; " + vehicleLabel + "</h2>" +
      "<p style='font-size:15px;'><strong>" + recordTypeLabel + "</strong> submitted by " + (record.submitted_by ?? "Unknown") + " on " + submittedAt + ".</p>" +
      "<p style='font-size:15px;'>The following thresholds were breached:</p>" +
      "<table style='border-collapse:collapse;font-family:sans-serif;font-size:15px;'>" +
      breachRows +
      "</table>" +
      "<hr style='margin-top:24px;'>" +
      "<p style='font-size:13px;color:#888;'>Automated alert from the Fleet Mileage app.<br>" +
      "<a href='https://fleet-mileage.pages.dev/admin/'>Open admin dashboard</a></p>";

    const emailText =
      "Maintenance Alert -- " + vehicleLabel + "\n\n" +
      recordTypeLabel + " submitted by " + (record.submitted_by ?? "Unknown") + " on " + submittedAt + ".\n\n" +
      "Thresholds breached:\n" +
      breaches.map((b) => "  - " + b).join("\n") + "\n\n" +
      "https://fleet-mileage.pages.dev/admin/";

    // --- 8. Send via Gmail SMTP ---
    const client = new SMTPClient({
      connection: {
        hostname: "smtp.gmail.com",
        port: 465,
        tls: true,
        auth: { username: gmailUser, password: gmailAppPassword },
      },
    });

    await client.send({
      from:    "\"Fleet Alerts\" <" + gmailUser + ">",
      to:      mechanicEmail,
      cc:      adminEmail,
      subject: "Maintenance Alert -- " + vehicleLabel + " -- " + recordTypeLabel,
      html:    emailHtml,
      content: emailText,
    });

    await client.close();

    return new Response(JSON.stringify({ success: true, breaches }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("send-maintenance-alert error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
