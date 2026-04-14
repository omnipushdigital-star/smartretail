import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-app-version",
};

/** Convert YouTube watch/short URLs to embeddable format */
function normalizeWebUrl(url: string | null | undefined): string | null | undefined {
    if (!url) return url;
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)+([\w-]{11})/);
    if (ytMatch) {
        const id = ytMatch[1];
        return `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&controls=0&loop=1&playlist=${id}`;
    }
    return url;
}

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    try {
        const { device_code: raw_dc, device_secret, current_version, origin } = await req.json();
        const device_code = (raw_dc || '').trim();

        if (!device_code || !device_secret)
            return Response.json({ error: 'device_code and device_secret required' }, { status: 400, headers: corsHeaders });

        const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

        // 1. Authenticate device
        const { data: device, error: devErr } = await supabase
            .from('devices')
            .select('*, role:roles(name, key), store:stores(id, name)')
            .eq('device_code', device_code)
            .is('deleted_at', null)
            .single();

        if (devErr || !device || device.device_secret !== device_secret || !device.active)
            return Response.json({ error: 'Invalid credentials or inactive device' }, { status: 401, headers: corsHeaders });

        const tid = device.tenant_id || '00000000-0000-0000-0000-000000000001';

        // 2. Resolve publication: DEVICE > STORE > GLOBAL
        let pub: any = null;
        let resolvedScope = '';
        if (device.role_id) {
            const { data: pubs } = await supabase
                .from('layout_publications')
                .select('*')
                .eq('tenant_id', tid).eq('role_id', device.role_id).eq('is_active', true)
                .order('published_at', { ascending: false });

            if (pubs && pubs.length > 0) {
                const devMatch = pubs.find((p: any) => p.device_id === device.id);
                const storeMatch = pubs.find((p: any) => p.store_id === device.store_id);
                const globalMatch = pubs.find((p: any) => p.scope === 'GLOBAL');
                if (devMatch) { pub = devMatch; resolvedScope = 'DEVICE'; }
                else if (storeMatch) { pub = storeMatch; resolvedScope = 'STORE'; }
                else if (globalMatch) { pub = globalMatch; resolvedScope = 'GLOBAL'; }
            }
        }

        if (!pub) return Response.json({ error: 'No active publication' }, { status: 404, headers: corsHeaders });

        // 3. Parallel Fetch Bundle & Layout
        const [bundleRes, layoutRes, regionMapsRes] = await Promise.all([
            supabase.from('bundles').select('*').eq('id', pub.bundle_id).single(),
            supabase.from('layouts').select('id, name, template_id').eq('id', pub.layout_id).single(),
            supabase.from('layout_region_playlists').select('region_id, playlist_id').eq('layout_id', pub.layout_id)
        ]);

        const layout = layoutRes.data;
        const bundle = bundleRes.data;
        if (!layout || !bundle) return Response.json({ error: 'Layout or Bundle missing' }, { status: 404, headers: corsHeaders });

        const templateRes = await supabase.from('layout_templates').select('id, name, regions').eq('id', layout.template_id).single();
        const template = templateRes.data;

        const playlistIds = [...new Set((regionMapsRes.data || []).map((r: any) => r.playlist_id))];
        const { data: rawItems } = await supabase.from('playlist_items').select('*').in('playlist_id', playlistIds).order('sort_order');

        // Dynamic Version calculation
        const pubTime = new Date(pub.published_at || pub.created_at).getTime();
        const dynamicVersion = `${bundle.version || 'v0'}-${pubTime}`;

        if (current_version && dynamicVersion === current_version) {
            return Response.json({ up_to_date: true, version: dynamicVersion, poll_seconds: 30 }, { headers: corsHeaders });
        }

        // Fetch Assets
        const mediaIds = [...new Set((rawItems || []).map((i: any) => i.media_id).filter(Boolean))];
        const { data: allMedia } = await supabase.from('media_assets').select('*').in('id', mediaIds);

        const assets = (allMedia || []).map(m => ({
            media_id: m.id, type: m.type, url: m.url || null, checksum_sha256: m.checksum_sha256 || null
        }));

        const regionPlaylists: Record<string, any[]> = {};
        for (const rm of (regionMapsRes.data || [])) {
            regionPlaylists[rm.region_id] = (rawItems || []).filter(i => i.playlist_id === rm.playlist_id);
        }

        return Response.json({
            device: { id: device.id, device_code: device.device_code, store_name: device.store?.name },
            resolved: { scope: resolvedScope, version: dynamicVersion },
            layout: { layout_id: layout.id, regions: template?.regions },
            region_playlists: regionPlaylists,
            assets,
            poll_seconds: 30
        }, { headers: corsHeaders });
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
    }
});
