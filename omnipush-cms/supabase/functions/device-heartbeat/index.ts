import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const body = await req.json();
        const { device_code, device_secret, current_version } = body;
        console.log('[Heartbeat] Received for:', device_code);

        if (!device_code || !device_secret) {
            console.error('[Heartbeat] Missing credentials');
            return Response.json({ error: "device_code and device_secret required" }, { status: 400, headers: corsHeaders });
        }

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        // Verify device credentials
        const { data: device, error: devErr } = await supabase
            .from("devices")
            .select("id, device_code, device_secret, active")
            .eq("device_code", device_code)
            .single();

        if (devErr || !device || device.device_secret !== device_secret || !device.active)
            return Response.json({ error: "Invalid credentials or inactive device" }, { status: 401, headers: corsHeaders });

        // Extract IP from headers
        const ip =
            req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
            req.headers.get("x-real-ip") ||
            null;

        // Insert heartbeat
        const { error: hbErr } = await supabase.from("device_heartbeats").insert({
            device_id: device.id,
            device_code: device.device_code,
            current_version: current_version || null,
            ip_address: ip,
            status: body.status || "online",
            last_seen_at: new Date().toISOString(),
        });

        if (hbErr) throw hbErr;

        return Response.json({ ok: true }, { headers: corsHeaders });
    } catch (err: any) {
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
    }
});
