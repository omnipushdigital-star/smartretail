import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-app-version",
};

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const { action, device_code, pairing_pin } = await req.json();
        const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

        if (action === 'INIT') {
            const pin = Math.floor(100000 + Math.random() * 900000).toString();
            await supabase.from("devices").upsert({
                device_code,
                pairing_pin: pin,
                pairing_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
                active: false
            }, { onConflict: 'device_code' });
            return Response.json({ pairing_pin: pin }, { headers: corsHeaders });
        }

        if (action === 'CLAIM_POLL') {
            const { data: dev } = await supabase.from("devices").select("*").eq("device_code", device_code).single();
            if (dev?.active && !dev.pairing_pin) {
                return Response.json({ status: 'CLAIMED', device_secret: dev.device_secret }, { headers: corsHeaders });
            }
            return Response.json({ status: 'PENDING' }, { headers: corsHeaders });
        }

        return Response.json({ error: "Invalid action" }, { status: 400, headers: corsHeaders });
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
    }
});
