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
        const { device_code, device_secret } = body;
        console.log('[Heartbeat] Received for:', device_code, '| Body keys:', Object.keys(body));

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

        // Extract credentials and known fields; everything else goes into meta
        const {
            device_code: _dc,
            device_secret: _ds,
            current_version,
            status,
            // Named telemetry fields (sent by PlayerPage)
            device_model,
            local_ip,
            platform,
            screen,
            ram_total_mb,
            ram_free_mb,
            storage_total_gb,
            storage_free_gb,
            storage_quota_unavailable,
            ...rest  // any other future fields
        } = body;

        // Build meta object explicitly from telemetry fields
        const meta: Record<string, any> = {}
        if (device_model !== undefined) meta.device_model = device_model
        if (local_ip !== undefined && local_ip !== null) meta.local_ip = local_ip
        if (platform !== undefined) meta.platform = platform
        if (screen !== undefined) meta.screen = screen
        if (ram_total_mb !== undefined) meta.ram_total_mb = ram_total_mb
        if (ram_free_mb !== undefined) meta.ram_free_mb = ram_free_mb
        if (storage_total_gb !== undefined) meta.storage_total_gb = storage_total_gb
        if (storage_free_gb !== undefined) meta.storage_free_gb = storage_free_gb
        if (storage_quota_unavailable !== undefined) meta.storage_quota_unavailable = storage_quota_unavailable
        // Merge any additional fields from rest
        Object.assign(meta, rest)

        console.log('[Heartbeat] Meta collected:', JSON.stringify(meta))

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
            status: status || "online",
            last_seen_at: new Date().toISOString(),
            meta: meta,
        });

        if (hbErr) {
            console.error('[Heartbeat] DB Insert Error:', hbErr)
            throw hbErr
        }

        return Response.json({ ok: true, meta_keys: Object.keys(meta) }, { headers: corsHeaders });
    } catch (err: any) {
        console.error('[Heartbeat] Fatal error:', err.message)
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
    }
});
