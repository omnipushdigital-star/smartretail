// supabase/functions/device-pairing/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const { action, device_code: raw_dc, pairing_pin, tenant_id } = await req.json();
        const device_code = (raw_dc || "").trim();

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        // ── ACTION: INIT (Called by Player) ──────────────────────────────────────
        if (action === 'INIT') {
            if (!device_code) throw new Error("device_code required");

            const pin = Math.floor(100000 + Math.random() * 900000).toString();
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 mins

            // Use upsert to handle both first-time and re-initialization
            // Note: We don't touch display_name if it already exists
            const { error } = await supabase
                .from("devices")
                .upsert({
                    device_code,
                    pairing_pin: pin,
                    pairing_expires_at: expiresAt,
                    active: false // Keep inactive until claimed
                }, {
                    onConflict: 'device_code'
                });

            if (error) {
                console.error("INIT Error:", error);
                return Response.json({ error: error.message }, { status: 400, headers: corsHeaders });
            }

            console.log(`[Pairing] INIT: ${device_code} -> ${pin}`);
            return Response.json({ pairing_pin: pin }, { headers: corsHeaders });
        }

        // ── ACTION: CLAIM_POLL (Called by Player) ────────────────────────────────
        if (action === 'CLAIM_POLL') {
            if (!device_code) throw new Error("device_code required");

            const { data: device, error } = await supabase
                .from("devices")
                .select("tenant_id, device_secret, pairing_pin, active, display_name, store_id, store:stores(name), role_id, role:roles(name)")
                .eq("device_code", device_code)
                .maybeSingle();

            if (error || !device) {
                return Response.json({ status: 'ERROR', message: 'Device not found' }, { headers: corsHeaders });
            }

            // If it's already active and has no pin, it's claimed
            if (device.active && !device.pairing_pin) {
                return Response.json({
                    status: 'CLAIMED',
                    device_secret: device.device_secret,
                    device_info: {
                        display_name: device.display_name,
                        store_id: device.store_id,
                        store_name: (device as any).store?.name || null,
                        tenant_id: device.tenant_id,
                        role_id: device.role_id,
                        role_name: (device as any).role?.name || null,
                    }
                }, { headers: corsHeaders });
            }

            return Response.json({ status: 'PENDING' }, { headers: corsHeaders });
        }

        // ── ACTION: CLAIM (Called by CMS) ────────────────────────────────────────
        if (action === 'CLAIM') {
            if (!pairing_pin) throw new Error("pairing_pin required");

            // Find device with valid pin
            const { data: device, error: findErr } = await supabase
                .from("devices")
                .select("*")
                .eq("pairing_pin", pairing_pin)
                .gt("pairing_expires_at", new Date().toISOString())
                .maybeSingle();

            if (findErr || !device) {
                return Response.json({ error: "Invalid or expired pairing code" }, { status: 400, headers: corsHeaders });
            }

            // Ensure it has a secret (default might be there, but let's be sure)
            const secret = device.device_secret || crypto.randomUUID();

            const { data: updated, error: updateErr } = await supabase
                .from("devices")
                .update({
                    tenant_id: tenant_id || DEFAULT_TENANT_ID,
                    device_secret: secret,
                    active: true,
                    pairing_pin: null, // Clear PIN triggers success in poll
                    pairing_expires_at: null
                })
                .eq("id", device.id)
                .select()
                .single();

            if (updateErr) throw updateErr;

            console.log(`[Pairing] CLAIM: ${device.device_code} paired successfully.`);
            return Response.json({ device: updated }, { headers: corsHeaders });
        }

        throw new Error(`Unknown action: ${action}`);

    } catch (err: any) {
        console.error("[Pairing Error]", err.message);
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
    }
});
