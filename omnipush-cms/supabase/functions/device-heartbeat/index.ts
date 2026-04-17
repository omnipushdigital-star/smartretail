import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-app-version",
};

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const body = await req.json();
        const { device_code, device_secret, current_version, status, ack_command_id } = body;
        
        console.log(`[Heartbeat] From ${device_code} (v: ${current_version})`);

        const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

        const { data: device, error: devErr } = await supabase
            .from("devices")
            .select("id, device_secret, active")
            .eq("device_code", device_code)
            .is("deleted_at", null)
            .single();

        if (devErr || !device) {
            console.warn(`[Heartbeat] Device not found in DB: ${device_code}`);
            return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
        }

        if (device.device_secret !== device_secret) {
            console.warn(`[Heartbeat] Secret mismatch for ${device_code}. Got: ${device_secret}`);
            return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
        }

        if (!device.active) {
            console.warn(`[Heartbeat] Device ${device_code} is inactive.`);
            return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
        }

        // Handle Command ACK
        if (ack_command_id) {
            const { error: ackErr } = await supabase.from("device_commands")
                .update({ status: "EXECUTED", updated_at: new Date().toISOString() })
                .eq("id", ack_command_id);
            if (ackErr) console.error(`[Heartbeat] ACK Error for ${ack_command_id}:`, ackErr);
        }

        // Write Heartbeat
        const { error: hbErr } = await supabase.from("device_heartbeats").insert({
            device_id: device.id,
            device_code,
            current_version,
            status: status || "online",
            last_seen_at: new Date().toISOString(),
            meta: body
        });
        
        if (hbErr) {
            console.error(`[Heartbeat] Insert Error for ${device_code}:`, hbErr);
        }

        // Fetch Pending Commands
        const { data: commands, error: cmdErr } = await supabase
            .from("device_commands")
            .select("id, command, payload")
            .eq("device_id", device.id)
            .eq("status", "PENDING")
            .order("created_at", { ascending: true });

        if (cmdErr) console.error(`[Heartbeat] Commands fetch error for ${device_code}:`, cmdErr);

        return Response.json({ ok: true, commands: commands || [] }, { headers: corsHeaders });
    } catch (err: any) {
        console.error("[Heartbeat System Error]", err.message);
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
    }
});
