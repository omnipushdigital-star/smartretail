import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VALID_EVENT_TYPES = new Set([
  "lan_connected", "lan_disconnected",
  "internet_lost", "internet_restored",
  "hdmi_connected", "hdmi_disconnected",
]);

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json();
    const { device_code, device_secret, event_type, occurred_at } = body;

    if (!device_code || !device_secret || !event_type) {
      return Response.json(
        { error: "device_code, device_secret, and event_type are required" },
        { status: 400, headers: CORS }
      );
    }

    if (!VALID_EVENT_TYPES.has(event_type)) {
      return Response.json(
        { error: `Invalid event_type: ${event_type}` },
        { status: 400, headers: CORS }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Validate device credentials and resolve tenant_id in one query
    const { data: device, error: devErr } = await supabase
      .from("devices")
      .select("id, tenant_id, device_secret, active")
      .eq("device_code", device_code)
      .is("deleted_at", null)
      .single();

    if (devErr || !device) {
      return Response.json({ error: "Device not found" }, { status: 401, headers: CORS });
    }
    if (device.device_secret !== device_secret || !device.active) {
      return Response.json({ error: "Invalid credentials or inactive device" }, { status: 401, headers: CORS });
    }

    const { error: insertErr } = await supabase.from("device_events").insert({
      tenant_id: device.tenant_id,
      device_code,
      event_type,
      occurred_at: occurred_at ?? new Date().toISOString(),
      meta: {},
    });

    if (insertErr) {
      console.error("[DeviceEvent] Insert failed:", insertErr);
      return Response.json({ error: "Insert failed" }, { status: 500, headers: CORS });
    }

    console.log(`[DeviceEvent] ${device_code} → ${event_type}`);
    return Response.json({ ok: true }, { headers: CORS });
  } catch (err: any) {
    console.error("[DeviceEvent] Fatal:", err.message);
    return Response.json({ error: err.message }, { status: 500, headers: CORS });
  }
});
