import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Supabase calls this function with the new fault row in the request body.
// We fetch the recipient addresses and Resend API key from app_settings,
// then send a formatted email via Resend.

Deno.serve(async (req) => {
  try {
    // --- 1. Parse the incoming webhook payload ---
    const payload = await req.json();
    const fault = payload.record; // the newly inserted faults row

    if (!fault) {
      return new Response("No record in payload", { status: 400 });
    }

    // --- 2. Connect to Supabase using the service role key ---
    // The service role key bypasses RLS so we can read app_settings.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // --- 3. Fetch config values from app_settings ---
    const { data: settings, error: settingsError } = await supabase
      .from("app_settings")
      .select("key, value");

    if (settingsError) throw settingsError;

    const config: Record<string, string> = {};
    for (const row of settings) {
      config[row.key] = row.value;
    }

    const mechanicEmail = config["mechanic_email"];
    const adminEmail    = config["admin_email"];
    const resendApiKey  = config["resend_api_key"];

    if (!mechanicEmail || !adminEmail || !resendApiKey) {
      throw new Error("Missing required config in app_settings");
    }

    // --- 4. Fetch the vehicle name for the email ---
    const { data: vehicle } = await supabase
      .from("vehicles")
      .select("name, plate")
      .eq("id", fault.vehicle_id)
      .single();

    const vehicleName = vehicle
      ? `${vehicle.name}${vehicle.plate ? ` (${vehicle.plate})` : ""}`
      : fault.vehicle_id;

    // --- 5. Build a human-readable fault type label ---
    const faultTypeLabels: Record<string, string> = {
      bulb:       "Bulb Out",
      adblue:     "AdBlue Low",
      tyre:       "Flat / Damaged Tyre",
      windscreen: "Windscreen Chip",
      damage:     "Dent / Damage",
      other:      "Other",
    };
    const faultTypeLabel = faultTypeLabels[fault.fault_type] ?? fault.fault_type;

    // --- 6. Format the reported date/time ---
    const reportedAt = new Date(fault.reported_at).toLocaleString("en-GB", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: "Europe/London",
    });

    // --- 7. Build the email HTML ---
    const photoLine = fault.photo_url
      ? `<p><strong>Photo:</strong> <a href="${fault.photo_url}">View attached photo</a></p>`
      : "";

    const emailHtml = `
      <h2 style="color:#c0392b;">⚠️ New Fault Report — ${vehicleName}</h2>
      <table style="border-collapse:collapse;font-family:sans-serif;font-size:15px;">
        <tr><td style="padding:6px 16px 6px 0;color:#555;">Vehicle</td>
            <td style="padding:6px 0;"><strong>${vehicleName}</strong></td></tr>
        <tr><td style="padding:6px 16px 6px 0;color:#555;">Fault type</td>
            <td style="padding:6px 0;"><strong>${faultTypeLabel}</strong></td></tr>
        <tr><td style="padding:6px 16px 6px 0;color:#555;">Severity</td>
            <td style="padding:6px 0;"><strong>${fault.severity ?? "—"}</strong></td></tr>
        <tr><td style="padding:6px 16px 6px 0;color:#555;">Description</td>
            <td style="padding:6px 0;">${fault.description ?? "—"}</td></tr>
        <tr><td style="padding:6px 16px 6px 0;color:#555;">Reported by</td>
            <td style="padding:6px 0;">${fault.driver_name ?? "Not given"}</td></tr>
        <tr><td style="padding:6px 16px 6px 0;color:#555;">Reported at</td>
            <td style="padding:6px 0;">${reportedAt}</td></tr>
      </table>
      ${photoLine}
      <hr style="margin-top:24px;">
      <p style="font-size:13px;color:#888;">
        This is an automated alert from the Fleet Mileage app.<br>
        Log in to the <a href="https://weekly-mileage.netlify.app/admin/">admin dashboard</a> to manage this fault.
      </p>
    `;

    const emailText = `
New Fault Report — ${vehicleName}

Vehicle:     ${vehicleName}
Fault type:  ${faultTypeLabel}
Severity:    ${fault.severity ?? "—"}
Description: ${fault.description ?? "—"}
Reported by: ${fault.driver_name ?? "Not given"}
Reported at: ${reportedAt}
${fault.photo_url ? `Photo: ${fault.photo_url}` : ""}

Log in to the admin dashboard to manage this fault:
https://weekly-mileage.netlify.app/admin/
    `.trim();

    // --- 8. Send via Resend ---
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from:    "Fleet Mileage <onboarding@resend.dev>",
        to:      [mechanicEmail],
        cc:      [adminEmail],
        subject: `⚠️ Fault Report — ${vehicleName} — ${faultTypeLabel}`,
        html:    emailHtml,
        text:    emailText,
      }),
    });

    if (!resendResponse.ok) {
      const errorBody = await resendResponse.text();
      throw new Error(`Resend error ${resendResponse.status}: ${errorBody}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("send-fault-email error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
