// supabase/functions/device-manifest/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const { device_code, device_secret, current_version, origin } = await req.json();

        if (!device_code || !device_secret)
            return Response.json({ error: "device_code and device_secret required" }, { status: 400, headers: corsHeaders });

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        // 1. Authenticate device
        const { data: device, error: devErr } = await supabase
            .from("devices")
            .select("*, role:roles(name, key)")
            .eq("device_code", device_code)
            .single();

        if (devErr || !device || device.device_secret !== device_secret || !device.active)
            return Response.json({ error: "Invalid credentials or inactive device" }, { status: 401, headers: corsHeaders });

        // Ensure tenant_id exists for query consistency
        const tid = device.tenant_id || '00000000-0000-0000-0000-000000000001';

        console.log(`[Manifest] Fetching for device ${device_code} (Role: ${device.role?.key || 'Unassigned'})`);

        // 2. Resolve publication: DEVICE > STORE > GLOBAL
        let resolutionError = "";
        let pub: any = null;
        let resolvedScope = "";
        let allPubs: any[] = [];

        if (device.role_id) {
            const { data: pubs, error: fetchErr } = await supabase
                .from("layout_publications")
                .select("*")
                .eq("tenant_id", tid)
                .eq("role_id", device.role_id)
                .eq("is_active", true)
                .order('published_at', { ascending: false });

            if (fetchErr) {
                console.error("[Manifest] Fetch error:", fetchErr);
                resolutionError = fetchErr.message;
            } else if (pubs) {
                allPubs = pubs;
            }

            if (allPubs && allPubs.length > 0) {
                const devMatch = allPubs.find((p: any) => p.device_id === device.id);
                const storeMatch = allPubs.find((p: any) => p.store_id === device.store_id);
                const globalMatch = allPubs.find((p: any) => p.scope === 'GLOBAL');

                if (devMatch) { pub = devMatch; resolvedScope = "DEVICE"; }
                else if (storeMatch) { pub = storeMatch; resolvedScope = "STORE"; }
                else if (globalMatch) { pub = globalMatch; resolvedScope = "GLOBAL"; }

                console.log(`[Manifest] Resolved: ${resolvedScope}`);
            }
        } else {
            resolutionError = "Device has no role assigned. Please assign a role in CMS.";
        }

        if (!pub) {
            let inactiveCheck: any[] = [];
            if (device.role_id) {
                const { data } = await supabase
                    .from("layout_publications")
                    .select("id, is_active, scope, role_id, tenant_id")
                    .eq("role_id", device.role_id)
                    .limit(1);
                if (data) inactiveCheck = data;
            }

            return Response.json({
                error: "No active publication found for this device",
                debug: {
                    device_tenant: tid,
                    device_role_id: device.role_id,
                    resolution_error: resolutionError || (allPubs?.length ? "No scope match" : "No active pubs for role"),
                    found_role_pub: inactiveCheck?.[0] ? {
                        scope: inactiveCheck[0].scope,
                        tenant: inactiveCheck[0].tenant_id,
                        active: inactiveCheck[0].is_active
                    } : null
                },
                device: {
                    id: device.id,
                    tenant_id: tid,
                    store_id: device.store_id,
                    role_id: device.role_id,
                    device_code: device.device_code,
                    role_name: device.role?.name || null,
                }
            }, { status: 404, headers: corsHeaders });
        }

        // 3. Fetch Bundle
        const { data: bundle } = await supabase
            .from("bundles")
            .select("*")
            .eq("id", pub.bundle_id)
            .single();

        // 4. Fetch layout + template
        const { data: layout } = await supabase
            .from("layouts")
            .select("id, name, template_id")
            .eq("id", pub.layout_id)
            .single();

        const { data: template } = await supabase
            .from("layout_templates")
            .select("id, name, regions")
            .eq("id", layout.template_id)
            .single();

        // 5. Fetch region→playlist mappings
        const { data: regionMaps } = await supabase
            .from("layout_region_playlists")
            .select("region_id, playlist_id")
            .eq("layout_id", layout.id);

        const playlistIds = [...new Set((regionMaps || []).map((r: any) => r.playlist_id))];

        // 6. Fetch playlist items
        const { data: rawItems } = await supabase
            .from("playlist_items")
            .select("*")
            .in("playlist_id", playlistIds)
            .order("sort_order");

        // VALIDATION: Filter out items that are incomplete
        const validRawItems = (rawItems || []).filter(item => {
            if (item.type === 'web_url') return !!item.web_url;
            return !!item.media_id;
        });

        // Filter out nulls (web_urls have no media_id)
        const mediaIds = [...new Set(validRawItems.map((i: any) => i.media_id).filter(Boolean))];
        const { data: allMedia } = await supabase
            .from("media_assets")
            .select("*")
            .in("id", mediaIds);

        // MAP ITEMS WITH ORIGIN SUPPORT
        const items = validRawItems.map((item: any) => {
            let finalWebUrl = item.web_url;
            // Prepend origin if it's a relative URL
            if (finalWebUrl && finalWebUrl.startsWith('/') && origin) {
                finalWebUrl = `${origin}${finalWebUrl}`;
            }
            return {
                ...item,
                web_url: finalWebUrl,
                media: allMedia?.find((m: any) => m.id === item.media_id)
            };
        });

        // 7. Generate signed URLs in bulk
        const storageItems = (items || []).filter((i: any) =>
            i.media && (i.media.type === "image" || i.media.type === "video") && i.media.storage_path
        );
        const uniquePaths = [...new Set(storageItems.map((i: any) => i.media.storage_path))];

        let signedUrlsMap: Record<string, string> = {};
        if (uniquePaths.length > 0) {
            // Filter out paths that already have public URLs (e.g., Cloudflare R2)
            const pathsToSign = uniquePaths.filter(path => {
                const asset = allMedia?.find(m => m.storage_path === path);
                return !(asset?.url && (asset.url.includes('r2.dev') || asset.url.includes('omnipushdigital.com')));
            });

            if (pathsToSign.length > 0) {
                const { data: signedResults, error: signedErr } = await supabase.storage
                    .from("signage_media")
                    .createSignedUrls(pathsToSign as string[], 3600);

                if (!signedErr && signedResults) {
                    signedUrlsMap = Object.fromEntries(signedResults.map((s: any) => [s.path, s.signedUrl]));
                }
            }
        }

        const mediaAssets: any[] = [];
        const seenMedia = new Set<string>();

        // We iterate over allMedia directly to ensure we catch everything we found
        for (const media of allMedia || []) {
            if (seenMedia.has(media.id)) continue;
            seenMedia.add(media.id);

            const url = signedUrlsMap[media.storage_path] || media.url || null;

            mediaAssets.push({
                media_id: media.id,
                type: media.type,
                url,
                checksum_sha256: media.checksum_sha256 || null,
                bytes: media.bytes || null,
            });
        }

        // 8. Build region_playlists map
        const regionPlaylists: Record<string, any[]> = {};
        for (const rm of regionMaps || []) {
            const regionItems = items
                .filter((i: any) => i.playlist_id === rm.playlist_id)
                .map((i: any) => ({
                    playlist_item_id: i.id,
                    media_id: i.media_id,
                    type: i.type,
                    web_url: i.web_url, // Now absolute
                    duration_seconds: i.duration_seconds,
                    sort_order: i.sort_order,
                }));
            regionPlaylists[rm.region_id] = regionItems;
        }

        const manifest = {
            device: {
                id: device.id,
                tenant_id: device.tenant_id,
                store_id: device.store_id,
                role_id: device.role_id,
                device_code: device.device_code,
                orientation: device.orientation,
                resolution: device.resolution,
            },
            resolved: {
                scope: resolvedScope,
                role: device.role?.name || null,
                pub_id: pub.id || null,
                bundle_id: bundle?.id || null,
                version: bundle?.version || null,
            },
            layout: {
                layout_id: layout.id,
                template_id: template.id,
                regions: template.regions,
            },
            region_playlists: regionPlaylists,
            assets: mediaAssets,
            poll_seconds: 30,
        };

        console.log(`[Manifest] Success: ${resolvedScope} publication found. Version: ${bundle?.version || 'N/A'}. Assets: ${mediaAssets.length}. Regions: ${Object.keys(regionPlaylists).length}`);

        return Response.json(manifest, { headers: corsHeaders });
    } catch (err: any) {
        console.error("[Manifest Fatal]", err);
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
    }
});
