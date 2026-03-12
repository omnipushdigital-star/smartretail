// supabase/functions/get-r2-upload-url/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { S3Client, PutObjectCommand } from "https://esm.sh/@aws-sdk/client-s3@3.341.0";
import { getSignedUrl } from "https://esm.sh/@aws-sdk/s3-request-presigner@3.341.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
            return new Response(JSON.stringify({ error: "No authorization header" }), {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Optional: Verify the user is authenticated with Supabase
        // const supabaseClient = createClient(
        //   Deno.env.get("SUPABASE_URL") ?? "",
        //   Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        //   { global: { headers: { Authorization: authHeader } } }
        // );
        // const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
        // if (authError || !user) throw new Error("Unauthorized");

        const { fileName, contentType, tenantId } = await req.json();

        if (!fileName || !contentType || !tenantId) {
            return new Response(JSON.stringify({ error: "fileName, contentType, and tenantId are required" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID");
        const R2_SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY");
        const R2_BUCKET_NAME = Deno.env.get("R2_BUCKET_NAME");
        const R2_ENDPOINT = Deno.env.get("R2_ENDPOINT");

        if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME || !R2_ENDPOINT) {
            return new Response(JSON.stringify({ error: "R2 configuration missing on server" }), {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const client = new S3Client({
            region: "auto",
            endpoint: R2_ENDPOINT,
            credentials: {
                accessKeyId: R2_ACCESS_KEY_ID,
                secretAccessKey: R2_SECRET_ACCESS_KEY,
            },
        });

        const key = `${tenantId}/${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

        const command = new PutObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: key,
            ContentType: contentType,
        });

        const uploadUrl = await getSignedUrl(client, command, { expiresIn: 3600 });

        return new Response(JSON.stringify({ uploadUrl, key }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
