import { S3Client, PutObjectCommand } from "https://esm.sh/@aws-sdk/client-s3@3.511.0";
import { getSignedUrl } from "https://esm.sh/@aws-sdk/s3-request-presigner@3.511.0";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-app-version",
};

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const { fileName, contentType, tenantId } = await req.json();

        if (!fileName || !contentType || !tenantId) {
            return Response.json({ error: "fileName, contentType, and tenantId are required" }, { status: 400, headers: corsHeaders });
        }

        const client = new S3Client({
            region: "auto",
            endpoint: Deno.env.get("R2_ENDPOINT") || '',
            credentials: { 
                accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID") || '', 
                secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY") || '' 
            },
        });

        const key = `${tenantId}/${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const command = new PutObjectCommand({ 
            Bucket: Deno.env.get("R2_BUCKET_NAME") || '', 
            Key: key, 
            ContentType: contentType 
        });

        const uploadUrl = await getSignedUrl(client, command, { expiresIn: 3600 });
        return Response.json({ uploadUrl, key }, { headers: corsHeaders });
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
    }
});
