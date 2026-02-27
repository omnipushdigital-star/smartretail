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
        const { action, device_code, pairing_pin } = await req.json();

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        // ── ACTION: INIT (Called by Player) ──────────────────────────────────────
        if (action === 'INIT') {
            if (!device_code) throw new Error("device_code required");

            const pin = Math.floor(100000 + Math.random() * 900000).toString();
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 mins

            // Find existing device
            const { data: device } = await supabase
                .from("devices")
                .select("id, device_secret")
                .eq("device_code", device_code)
                .maybeSingle();

            if (device) {
                // IMPORTANT: We set a new PIN but we DO NOT clear the secret yet.
                // However, we want to ensure CLAIM_POLL doesn't use the old secret.
                const { error } = await supabase
                    .from("devices")
                    .update({
                        pairing_pin: pin,
                        pairing_expires_at: expiresAt
                        // We keep device_secret but CLAIM_POLL will ignore it if pairing_pin exists.
                    })
                    .eq("id", device.id);
                if (error) throw error;
            } else {
                // Create a new record
                const { error } = await supabase
                    .from("devices")
                    .insert({
                        device_code,
                        pairing_pin: pin,
                        pairing_expires_at: expiresAt,
                        display_name: `New Device (${device_code})`,
                        active: false
                    });
                if (error) throw error;
            }

            console.log(`[Pairing] INIT: ${device_code} -> ${pin}`);
            return Response.json({ pairing_pin: pin }, { headers: corsHeaders });
        }

        // ── ACTION: CLAIM_POLL (Called by Player) ────────────────────────────────
        if (action === 'CLAIM_POLL') {
            if (!device_code) throw new Error("device_code required");

            // Only return secret if the pairing_pin has been cleared (meaning CLAIM was called)
            const { data: device, error } = await supabase
                .from("devices")
                .select("device_secret, pairing_pin")
                .eq("device_code", device_code)
                .single();

            // If there is still a pairing_pin, it means the user hasn't claimed it in CMS yet.
            if (error || !device?.device_secret || device.pairing_pin) {
                return Response.json({ status: 'PENDING' }, { headers: corsHeaders });
            }

            return Response.json({ device_secret: device.device_secret }, { headers: corsHeaders });
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

            // Generate credentials
            const secret = crypto.randomUUID();

            const { data: updated, error: updateErr } = await supabase
                .from("devices")
                .update({
                    tenant_id: DEFAULT_TENANT_ID,
                    device_secret: secret,
                    active: true,
                    pairing_pin: null, // CLEAR PIN -> This triggers CLAIM_POLL success
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
