import React, { useState } from 'react'
import { Copy, Check, Terminal, Code2, Zap, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'
import toast from 'react-hot-toast'

const ENV_EXAMPLE = "// .env (omnipush-cms root)\nVITE_SUPABASE_URL = https://[your-project-ref].supabase.co\nVITE_SUPABASE_ANON_KEY = [your-anon-key]\n\n// The edge functions are called at:\n// POST [VITE_SUPABASE_URL]/functions/v1/device-manifest\n// POST [VITE_SUPABASE_URL]/functions/v1/device-heartbeat";

const MANIFEST_EXPECTED_RESP = `{
    "device": { "id": "...", "device_code": "DUB01_MAIN_001", "orientation": "landscape", "resolution": "1920x1080" },
    "resolved": { "scope": "GLOBAL", "bundle_id": "...", "version": "v1.0.0" },
    "layout": { "layout_id": "...", "template_id": "...", "regions": [...] },
    "region_playlists": {
      "full": [
        { "playlist_item_id": "...", "media_id": "...", "order_index": 0, "duration_seconds": 8 }
      ]
    },
    "assets": [
      { "media_id": "...", "type": "image", "url": "https://...signed-url...", "checksum_sha256": null, "bytes": null }
    ],
    "poll_seconds": 120
}`;

// --- Edge Function source code ---------------------------------------------

const MANIFEST_FN = `// supabase/functions/device-manifest/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { device_code, device_secret, current_version } = await req.json();
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

    console.log(\`[Manifest] Fetching for device \${device_code} (Role: \${device.role?.key || 'Unassigned'})\`);

    // 2. Resolve publication: DEVICE > STORE > GLOBAL (Bulletproof JS resolution)
    let resolutionError = "";
    let pub: any = null;
    let resolvedScope = "";
    
    // Fetch all active pubs as a simplified list
    const { data: allPubs, error: fetchErr } = await supabase
        .from("layout_publications")
        .select("*")
        .eq("tenant_id", tid)
        .eq("role_id", device.role_id)
        .eq("is_active", true)
        .order('published_at', { ascending: false });

    if (fetchErr) {
        console.error("[Manifest] Fetch error:", fetchErr);
        resolutionError = fetchErr.message;
    }

    if (allPubs && allPubs.length > 0) {
        const devMatch = allPubs.find(p => p.device_id === device.id);
        const storeMatch = allPubs.find(p => p.store_id === device.store_id);
        const globalMatch = allPubs.find(p => p.scope === 'GLOBAL');

        if (devMatch) { pub = devMatch; resolvedScope = "DEVICE"; }
        else if (storeMatch) { pub = storeMatch; resolvedScope = "STORE"; }
        else if (globalMatch) { pub = globalMatch; resolvedScope = "GLOBAL"; }
        
        console.log(\`[Manifest] Resolved: \${resolvedScope}\`);
    }

    if (!pub) {
      const { data: inactiveCheck } = await supabase
        .from("layout_publications")
        .select("id, is_active, scope, role_id, tenant_id")
        .eq("role_id", device.role_id)
        .limit(1);

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

    // 3. Fetch Bundle (Join-free)
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

    // 5. Fetch regionâ†’playlist mappings
    const { data: regionMaps } = await supabase
      .from("layout_region_playlists")
      .select("region_id, playlist_id")
      .eq("layout_id", layout.id);

    const playlistIds = [...new Set((regionMaps || []).map((r: any) => r.playlist_id))];

    // 6. Fetch playlist items (Join-free)
    const { data: rawItems } = await supabase
      .from("playlist_items")
      .select("*")
      .in("playlist_id", playlistIds)
      .order("sort_order");
    
    const mediaIds = [...new Set((rawItems || []).map((i: any) => i.media_id))];
    const { data: allMedia } = await supabase
      .from("media_assets")
      .select("*")
      .in("id", mediaIds);

    // Merge media back into items
    const items = (rawItems || []).map(item => ({
        ...item,
        media: allMedia?.find(m => m.id === item.media_id)
    }));

    // 7. Generate signed URLs for storage assets in bulk (Optimized)
    const storageItems = (items || []).filter((i: any) => 
      i.media && (i.media.type === "image" || i.media.type === "video") && i.media.storage_path
    );
    const uniquePaths = [...new Set(storageItems.map((i: any) => i.media.storage_path))];
    
    let signedUrlsMap: Record<string, string> = {};
    if (uniquePaths.length > 0) {
      const { data: signedResults, error: signedErr } = await supabase.storage
        .from("signage_media")
        .createSignedUrls(uniquePaths, 3600); // 1 hour TTL
      
      if (!signedErr && signedResults) {
        signedUrlsMap = Object.fromEntries(signedResults.map(s => [s.path, s.signedUrl]));
      }
    }

    const mediaAssets: any[] = [];
    const seenMedia = new Set<string>();

    for (const item of items || []) {
      const media = item.media;
      if (!media || seenMedia.has(media.id)) continue;
      seenMedia.add(media.id);

      const url = signedUrlsMap[media.storage_path] || media.url || media.web_url || null;

      mediaAssets.push({
        media_id: media.id,
        type: media.type,
        url,
        checksum_sha256: media.checksum_sha256 || null,
        bytes: media.bytes || null,
      });
    }

    // 7. Build region_playlists map
    const regionPlaylists: Record<string, any[]> = {};
    for (const rm of regionMaps || []) {
      const regionItems = (items || [])
        .filter((i: any) => i.playlist_id === rm.playlist_id)
        .map((i: any) => ({
          playlist_item_id: i.id,
          media_id: i.media_id,
          type: i.type,
          web_url: i.web_url,
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

    console.log(\`[Manifest] Success: \${resolvedScope} publication found. Version: \${bundle?.version || 'N/A'}\`);

    return Response.json(manifest, { headers: corsHeaders });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
  }
});`;

const HEARTBEAT_FN = `// supabase/functions/device-heartbeat/index.ts
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
    const { device_code, device_secret, current_version } = body;
    console.log('[Heartbeat] Received for:', device_code);

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
      status: body.status || "online",
      last_seen_at: new Date().toISOString(),
    });

    if (hbErr) throw hbErr;

    return Response.json({ ok: true }, { headers: corsHeaders });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
  }
});`;

const PAIRING_FN = `// supabase/functions/device-pairing/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { action, device_code, pairing_pin } = await req.json();
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // 1. INIT - Device requests a pairing pin
    if (action === 'INIT') {
      if (!device_code) return Response.json({ error: "device_code required" }, { status: 400, headers: corsHeaders });
      
      const pin = Math.floor(100000 + Math.random() * 900000).toString();
      const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 mins

      const { data, error } = await supabase
        .from("devices")
        .update({ pairing_pin: pin, pairing_expires_at: expires, pair_confirmed: false })
        .eq("device_code", device_code)
        .select()
        .single();

      if (error || !data) return Response.json({ error: "Device not found in registry" }, { status: 404, headers: corsHeaders });
      return Response.json({ pairing_pin: pin }, { headers: corsHeaders });
    }

    // 2. CLAIM - Admin enters pin in CMS
    if (action === 'CLAIM') {
      if (!pairing_pin) return Response.json({ error: "pairing_pin required" }, { status: 400, headers: corsHeaders });
      
      const { data: updated, error: updErr } = await supabase
        .from("devices")
        .update({ pair_confirmed: true })
        .eq("pairing_pin", pairing_pin)
        .gt("pairing_expires_at", new Date().toISOString())
        .select("device_code, display_name")
        .single();

      if (updErr || !updated) return Response.json({ error: "Invalid or expired PIN" }, { status: 404, headers: corsHeaders });

      return Response.json({ success: true, device: updated }, { headers: corsHeaders });
    }

    // 3. POLL - Player checks if it was claimed
    if (action === 'CLAIM_POLL') {
      if (!device_code) return Response.json({ error: "device_code required" }, { status: 400, headers: corsHeaders });

      const { data: device, error } = await supabase
        .from("devices")
        .select("device_secret, pair_confirmed")
        .eq("device_code", device_code)
        .single();

      if (error || !device) return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
      if (!device.pair_confirmed) return Response.json({ confirmed: false }, { headers: corsHeaders });

      // Clear the pin once claimed
      await supabase.from("devices").update({ pairing_pin: null, pairing_expires_at: null }).eq("device_code", device_code);

      return Response.json({ confirmed: true, device_secret: device.device_secret }, { headers: corsHeaders });
    }

    return Response.json({ error: "Invalid action" }, { status: 400, headers: corsHeaders });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
  }
});`;

const CURL_MANIFEST = `curl -X POST \\
  'https://[your-project-ref].supabase.co/functions/v1/device-manifest' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer [your-anon-key]' \\
  -d '{"device_code":"DUB01_MAIN_001","device_secret":"[device-secret]"}'`

const CURL_HEARTBEAT = `curl -X POST \\
  'https://[your-project-ref].supabase.co/functions/v1/device-heartbeat' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer [your-anon-key]' \\
  -d '{"device_code":"DUB01_MAIN_001","device_secret":"[device-secret]","current_version":"v1.0.0"}'`

const CURL_PAIRING_INIT = `curl -X POST https://[your-project-ref].supabase.co/functions/v1/device-pairing \\
  -H "Authorization: Bearer [your-anon-key]" \\
  -H "Content-Type: application/json" \\
  -d '{"action": "INIT", "device_code": "DUB01_MAIN_001"}'`;

const CURL_PAIRING_CLAIM = `curl -X POST https://[your-project-ref].supabase.co/functions/v1/device-pairing \\
  -H "Authorization: Bearer [your-anon-key]" \\
  -H "Content-Type: application/json" \\
  -d '{"action": "CLAIM", "pairing_pin": "123456"}'`;

// --- Component --------------------------------------------------------------

function CopyBlock({ code, label, language = 'typescript' }: { code: string; label: string; language?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      toast.success('Copied to clipboard!')
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#94a3b8' }}>{label}</span>
        <button
          onClick={copy}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.375rem',
            padding: '0.375rem 0.75rem', borderRadius: 6,
            background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(90,100,246,0.12)',
            border: copied ? '1px solid rgba(34,197,94,0.4)' : '1px solid rgba(90,100,246,0.3)',
            color: copied ? '#22c55e' : '#7a8aff',
            fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <div style={{
        background: '#020617', borderRadius: 10,
        border: '1px solid #1e293b', overflow: 'auto',
        maxHeight: 420, position: 'relative',
      }}>
        <pre style={{
          margin: 0, padding: '1rem 1.25rem',
          fontFamily: '"Fira Code", "Fira Mono", Consolas, monospace',
          fontSize: '0.75rem', lineHeight: 1.7,
          color: '#cbd5e1', whiteSpace: 'pre',
        }}>
          {code}
        </pre>
      </div>
    </div>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: 'linear-gradient(135deg, var(--color-brand-500), var(--color-brand-600))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: '0.8125rem', color: 'white', marginTop: 2,
      }}>{n}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, color: '#f1f5f9', marginBottom: '0.5rem', fontSize: '0.9375rem' }}>{title}</div>
        <div style={{ color: '#94a3b8', fontSize: '0.875rem', lineHeight: 1.7 }}>{children}</div>
      </div>
    </div>
  )
}

function Section({ title, icon, children, defaultOpen = true }: { title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="card" style={{ marginBottom: '1.25rem', padding: 0, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          width: '100%', padding: '1rem 1.25rem',
          background: 'none', border: 'none', cursor: 'pointer',
          borderBottom: open ? '1px solid #1e293b' : 'none',
          textAlign: 'left',
        }}
      >
        <span style={{ color: 'var(--color-brand-500)', display: 'flex' }}>{icon}</span>
        <span style={{ flex: 1, fontWeight: 700, color: '#f1f5f9', fontSize: '1rem' }}>{title}</span>
        <span style={{ color: '#475569' }}>{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
      </button>
      {open && <div style={{ padding: '1.25rem' }}>{children}</div>}
    </div>
  )
}

function InfoBox({ type = 'info', children }: { type?: 'info' | 'warn' | 'tip'; children: React.ReactNode }) {
  const styles: Record<string, { bg: string; border: string; color: string }> = {
    info: { bg: 'rgba(90,100,246,0.08)', border: 'rgba(90,100,246,0.25)', color: '#7a8aff' },
    warn: { bg: 'rgba(234,179,8,0.08)', border: 'rgba(234,179,8,0.25)', color: '#fbbf24' },
    tip: { bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.25)', color: '#22c55e' },
  }
  const boxStyle = styles[type]
  return (
    <div style={{
      display: 'flex', gap: '0.625rem', alignItems: 'flex-start',
      background: boxStyle.bg, border: ['1px solid ', boxStyle.border].join(''),
      borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem',
      fontSize: '0.8125rem', lineHeight: 1.6, color: '#cbd5e1',
    }}>
      <AlertCircle size={14} color={boxStyle.color} style={{ flexShrink: 0, marginTop: 2 }} />
      <div>{children}</div>
    </div>
  )
}

export default function EdgeFunctionsPage() {
  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Edge Functions Setup</h1>
          <p className="page-subtitle">Deploy the Player API to Supabase â€” step-by-step instructions &amp; full source code</p>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          padding: '0.5rem 1rem', borderRadius: 999,
          background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)',
          color: '#fbbf24', fontSize: '0.8125rem', fontWeight: 500,
        }}>
          <Zap size={14} />
          Manual via Supabase Dashboard
        </div>
      </div>

      <InfoBox type="warn">
        Edge Functions must be deployed via the <strong>Supabase Dashboard â†’ Edge Functions</strong> or the Supabase CLI.
        MCP / SQL cannot deploy them. Follow the steps below for each function.
      </InfoBox>

      {/* â”€â”€ Overview â”€â”€ */}
      <Section title="Overview â€” What These Functions Do" icon={<Code2 size={18} />}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          {[
            { name: 'device-manifest', method: 'POST', desc: 'Authenticates device, resolves the active publication (DEVICE > STORE > GLOBAL), fetches layout + playlists + media with signed URLs. Called every 120s by the Player.' },
            { name: 'device-heartbeat', method: 'POST', desc: 'Authenticates device and inserts a heartbeat row. Called every 30s by the Player. Powers the Monitoring dashboard.' },
          ].map(f => (
            <div key={f.name} style={{ background: 'rgba(90,100,246,0.06)', border: '1px solid rgba(90,100,246,0.15)', borderRadius: 10, padding: '1rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.875rem', color: '#7a8aff' }}>{f.name}</span>
                <span className="badge badge-blue">{f.method}</span>
              </div>
              <div style={{ fontSize: '0.8125rem', color: '#94a3b8', lineHeight: 1.6 }}>{f.desc}</div>
            </div>
          ))}
        </div>
        <div style={{ background: 'rgba(90,100,246,0.05)', padding: '1rem', borderRadius: 10, border: '1px solid rgba(90,100,246,0.1)', color: '#94a3b8', fontSize: '0.8125rem', lineHeight: 1.6 }}>
          Both functions use <code style={{ color: '#7a8aff' }}>SUPABASE_URL</code> and <code style={{ color: '#7a8aff' }}>SUPABASE_SERVICE_ROLE_KEY</code> which are automatically injected by Supabase — no manual env config needed.
        </div>
      </Section>

      {/* ── How to deploy ── */}
      <Section title="How to Deploy via Supabase Dashboard" icon={<Terminal size={18} />}>
        <Step n={1} title='Open Supabase Dashboard → Edge Functions'>
          Go to <strong style={{ color: '#7a8aff' }}>supabase.com/dashboard</strong> → select your project → click <strong>"Edge Functions"</strong> in the left sidebar.
        </Step>
        <Step n={2} title='Create a new function'>
          Click <strong>"New Function"</strong>. Name it exactly: <code style={{ color: '#7a8aff', fontFamily: 'monospace' }}>device-manifest</code>. Leave defaults and click <strong>"Create Function"</strong>.
        </Step>
        <Step n={3} title='Paste the source code'>
          In the inline editor, <strong>replace all existing content</strong> with the code block below. Then click <strong>"Save"</strong> and <strong>"Deploy"</strong>.
        </Step>
        <Step n={4} title='Enable "Invoke via browser" (CORS)'>
          In the function settings, under <strong>"Authentication"</strong>, you can disable JWT verification if the Player sends the anon key â€” or keep it enabled and pass the <code>Authorization: Bearer &lt;anon-key&gt;</code> header (the PlayerPage already does this). CORS is handled inside the function via <code>corsHeaders</code>.
        </Step>
        <Step n={5} title='Repeat for device-heartbeat'>
          Create a second function named <code style={{ color: '#7a8aff', fontFamily: 'monospace' }}>device-heartbeat</code> with the heartbeat code block below.
        </Step>
        <InfoBox type="tip">
          <strong>Environment variables</strong> â€” <code>SUPABASE_URL</code> and <code>SUPABASE_SERVICE_ROLE_KEY</code> are auto-injected into every Edge Function by Supabase. You do not need to add them manually.
        </InfoBox>
      </Section>

      {/* â”€â”€ Function A â”€â”€ */}
      <Section title="Function A â€” device-manifest (full source)" icon={<Code2 size={18} />}>
        <InfoBox type="info">
          File path in editor: <code>supabase/functions/device-manifest/index.ts</code> â€” paste the entire block below.
        </InfoBox>
        <CopyBlock code={MANIFEST_FN} label="device-manifest/index.ts" />

        <div style={{ fontWeight: 600, color: '#f1f5f9', marginBottom: '0.625rem', fontSize: '0.875rem' }}>Test cURL</div>
        <CopyBlock code={CURL_MANIFEST} label="Bash â€” test device-manifest" language="bash" />

        <div style={{ fontWeight: 600, color: '#f1f5f9', marginBottom: '0.625rem', fontSize: '0.875rem' }}>Expected response</div>
        <CopyBlock code={MANIFEST_EXPECTED_RESP} label="Expected JSON response" language="json" />
      </Section>

      {/* â”€â”€ Function B â”€â”€ */}
      <Section title="Function B â€” device-heartbeat (full source)" icon={<Code2 size={18} />}>
        <InfoBox type="info">
          File path in editor: <code>supabase/functions/device-heartbeat/index.ts</code> â€” paste the entire block below.
        </InfoBox>
        <CopyBlock code={HEARTBEAT_FN} label="device-heartbeat/index.ts" />

        <div style={{ fontWeight: 600, color: '#f1f5f9', marginBottom: '0.625rem', fontSize: '0.875rem' }}>Test cURL</div>
        <CopyBlock code={CURL_HEARTBEAT} label="Bash â€” test device-heartbeat" language="bash" />

        <div style={{ fontWeight: 600, color: '#f1f5f9', marginBottom: '0.625rem', fontSize: '0.875rem' }}>Expected response</div>
        <div style={{ background: '#0f172a', padding: '0.75rem', borderRadius: 8, fontFamily: 'monospace', fontSize: '0.75rem', color: '#94a3b8' }}>{'{ "ok": true }'}</div>
      </Section>

      {/* â”€â”€ Function C â”€â”€ */}
      <Section title="Function C â€” device-pairing (full source)" icon={<Zap size={18} />}>
        <InfoBox type="info">
          File path in editor: <code>supabase/functions/device-pairing/index.ts</code> â€” paste the entire block below.
        </InfoBox>
        <div style={{ marginBottom: '1rem', color: '#64748b', fontSize: '0.8125rem' }}>
          This function handles the simplified PIN-based pairing. A device shows a 6-digit code, and an admin enters it in the CMS to claim it.
        </div>
        <CopyBlock code={PAIRING_FN} label="device-pairing/index.ts" />

        <div style={{ fontWeight: 600, color: '#f1f5f9', marginBottom: '0.625rem', fontSize: '0.875rem' }}>Test cURL (Initialize PIN)</div>
        <CopyBlock code={CURL_PAIRING_INIT} label="Bash â€” initialize pairing" language="bash" />

        <div style={{ fontWeight: 600, color: '#f1f5f9', marginBottom: '0.625rem', fontSize: '0.875rem' }}>Test cURL (Claim PIN)</div>
        <CopyBlock code={CURL_PAIRING_CLAIM} label="Bash â€” claim device" language="bash" />
      </Section>

      {/* â”€â”€ Env vars reference â”€â”€ */}
      <Section title="Environment Variables Reference" icon={<Terminal size={18} />} defaultOpen={false}>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Variable</th>
                <th>Value</th>
                <th>How to get it</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['SUPABASE_URL', 'Auto-injected', 'Automatically available in all Edge Functions'],
                ['SUPABASE_SERVICE_ROLE_KEY', 'Auto-injected', 'Automatically available in all Edge Functions'],
                ['SUPABASE_ANON_KEY', 'Project Settings â†’ API', 'Used by PlayerPage on the frontend (in .env)'],
              ].map(([v, val, how]) => (
                <tr key={v}>
                  <td><code style={{ fontFamily: 'monospace', color: '#7a8aff' }}>{v}</code></td>
                  <td><span className={val === 'Auto-injected' ? 'badge badge-green' : 'badge badge-gray'}>{val}</span></td>
                  <td style={{ color: '#94a3b8', fontSize: '0.8125rem' }}>{how}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* â”€â”€ PlayerPage config â”€â”€ */}
      <Section title="PlayerPage Frontend Config" icon={<Code2 size={18} />} defaultOpen={false}>
        <InfoBox type="info">
          The PlayerPage is already wired to call these Edge Functions. Make sure your <code>.env</code> has the correct Supabase project URL.
        </InfoBox>
        <CopyBlock
          code={ENV_EXAMPLE}
          label=".env configuration"
          language="bash"
        />
        <p style={{ color: '#64748b', fontSize: '0.8125rem', lineHeight: 1.7 }}>
          Player URL format: <code style={{ color: '#7a8aff' }}>/player/:device_code</code> â€” e.g. <code style={{ color: '#7a8aff' }}>/player/DUB01_MAIN_001</code>.
          The Player will prompt for the device secret on first launch and save it in localStorage.
        </p>
      </Section>
    </div >
  )
}
