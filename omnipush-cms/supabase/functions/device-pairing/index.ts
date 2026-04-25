import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-app-version",
};

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const body = await req.json();
        console.log("[Pairing] Request:", body);
        const { action, pairing_pin, tenant_id } = body;
        const device_code = (body.device_code || "").trim();

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        // ── ACTION: INIT (Called by Player) ──────────────────────────────────────
        if (action === 'INIT') {
            if (!device_code) throw new Error("device_code required");

            const pin = Math.floor(10000000 + Math.random() * 90000000).toString();
            const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // Increased to 15 mins for safety

            console.log(`[Pairing] INIT: Generating PIN ${pin} for ${device_code}`);

            const { error } = await supabase
                .from("devices")
                .upsert({
                    device_code,
                    pairing_pin: pin,
                    pairing_expires_at: expiresAt,
                    active: false 
                }, {
                    onConflict: 'device_code'
                });

            if (error) {
                console.error("INIT Error:", error);
                return Response.json({ error: error.message }, { status: 400, headers: corsHeaders });
            }

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
            const cleanPin = pairing_pin?.toString().trim();
            if (!cleanPin) throw new Error("pairing_pin required");

            console.log(`[Pairing] CLAIM attempt for PIN: ${cleanPin}`);

            // Find device with valid pin
            const { data: device, error: findErr } = await supabase
                .from("devices")
                .select("*")
                .eq("pairing_pin", cleanPin)
                .maybeSingle();

            if (findErr || !device) {
                console.warn(`[Pairing] CLAIM failed: PIN ${cleanPin} not found in DB`);
                return Response.json({ error: "Invalid pairing code" }, { status: 400, headers: corsHeaders });
            }

            // Check expiry separately for better error messages
            const expiry = new Date(device.pairing_expires_at).getTime();
            const now = Date.now();
            if (expiry < now) {
                console.warn(`[Pairing] CLAIM failed: PIN ${cleanPin} expired at ${device.pairing_expires_at}`);
                return Response.json({ error: "Pairing code expired. Please refresh the device." }, { status: 400, headers: corsHeaders });
            }

            // Ensure it has a secret 
            const secret = device.device_secret || crypto.randomUUID();

            const { data: updated, error: updateErr } = await supabase
                .from("devices")
                .update({
                    tenant_id: tenant_id || DEFAULT_TENANT_ID,
                    device_secret: secret,
                    active: true,
                    pairing_pin: null,
                    pairing_expires_at: null
                })
                .eq("id", device.id)
                .select()
                .single();

            if (updateErr) throw updateErr;

            console.log(`[Pairing] CLAIM success: ${device.device_code} paired.`);
            return Response.json({ device: updated }, { headers: corsHeaders });
        }

        throw new Error(`Unknown action: ${action}`);

    } catch (err: any) {
        console.error("[Pairing Error]", err.message);
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
    }
});
