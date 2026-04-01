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

import MANIFEST_FN from '../../../supabase/functions/device-manifest/index.ts?raw';
import HEARTBEAT_FN from '../../../supabase/functions/device-heartbeat/index.ts?raw';
import PAIRING_FN from '../../../supabase/functions/device-pairing/index.ts?raw';
import R2_UPLOAD_FN from '../../../supabase/functions/get-r2-upload-url/index.ts?raw';

const CURL_MANIFEST = `curl -X POST \\
  'https://[your-project-ref].supabase.co/functions/v1/device-manifest' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer [your-anon-key]' \\
  -d '{"device_code":"DUB01_MAIN_001","device_secret":"[device-secret]"}'`;

const CURL_HEARTBEAT = `curl -X POST \\
  'https://[your-project-ref].supabase.co/functions/v1/device-heartbeat' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer [your-anon-key]' \\
  -d '{"device_code":"DUB01_MAIN_001","device_secret":"[device-secret]","current_version":"v1.0.0"}'`;

const CURL_PAIRING_INIT = `curl -X POST https://[your-project-ref].supabase.co/functions/v1/device-pairing \\
  -H "Authorization: Bearer [your-anon-key]" \\
  -H "Content-Type: application/json" \\
  -d '{"action": "INIT", "device_code": "DUB01_MAIN_001"}'`;

const CURL_PAIRING_CLAIM = `curl -X POST https://[your-project-ref].supabase.co/functions/v1/device-pairing \\
  -H "Authorization: Bearer [your-anon-key]" \\
  -H "Content-Type: application/json" \\
  -d '{"action": "CLAIM", "pairing_pin": "123456"}'`;

const CURL_R2_UPLOAD = `curl -X POST https://[your-project-ref].supabase.co/functions/v1/get-r2-upload-url \\
  -H "Authorization: Bearer [your-anon-key]" \\
  -H "Content-Type: application/json" \\
  -d '{"fileName": "test.jpg", "contentType": "image/jpeg", "tenantId": "00000000-0000-0000-0000-000000000001"}'`;

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
          <p className="page-subtitle">Deploy the Player API to Supabase — step-by-step instructions &amp; full source code</p>
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
        Edge Functions must be deployed via the <strong>Supabase Dashboard → Edge Functions</strong> or the Supabase CLI.
        MCP / SQL cannot deploy them. Follow the steps below for each function.
      </InfoBox>

      {/* ── Overview ── */}
      <Section title="Overview — What These Functions Do" icon={<Code2 size={18} />}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          {[
            { name: 'device-manifest', method: 'POST', desc: 'Authenticates device, resolves the active publication (DEVICE > STORE > GLOBAL), fetches layout + playlists + media with signed URLs. Called every 120s by the Player.' },
            { name: 'device-heartbeat', method: 'POST', desc: 'Authenticates device and inserts a heartbeat row. Called every 30s by the Player. Powers the Monitoring dashboard.' },
            { name: 'get-r2-upload-url', method: 'POST', desc: 'Generates a secure, one-time upload link for Cloudflare R2. Used by the CMS to upload images/videos without exposing account details.' },
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
          In the function settings, under <strong>"Authentication"</strong>, you can disable JWT verification if the Player sends the anon key — or keep it enabled and pass the <code>Authorization: Bearer &lt;anon-key&gt;</code> header (the PlayerPage already does this). CORS is handled inside the function via <code>corsHeaders</code>.
        </Step>
        <Step n={5} title='Repeat for device-heartbeat'>
          Create a second function named <code style={{ color: '#7a8aff', fontFamily: 'monospace' }}>device-heartbeat</code> with the heartbeat code block below.
        </Step>
        <InfoBox type="tip">
          <strong>Environment variables</strong> — <code>SUPABASE_URL</code> and <code>SUPABASE_SERVICE_ROLE_KEY</code> are auto-injected into every Edge Function by Supabase. You do not need to add them manually.
        </InfoBox>
      </Section>

      {/* ── Function A ── */}
      <Section title="Function A — device-manifest (full source)" icon={<Code2 size={18} />}>
        <InfoBox type="info">
          File path in editor: <code>supabase/functions/device-manifest/index.ts</code> — paste the entire block below.
        </InfoBox>
        <CopyBlock code={MANIFEST_FN} label="device-manifest/index.ts" />

        <div style={{ fontWeight: 600, color: '#f1f5f9', marginBottom: '0.625rem', fontSize: '0.875rem' }}>Test cURL</div>
        <CopyBlock code={CURL_MANIFEST} label="Bash — test device-manifest" language="bash" />

        <div style={{ fontWeight: 600, color: '#f1f5f9', marginBottom: '0.625rem', fontSize: '0.875rem' }}>Expected response</div>
        <CopyBlock code={MANIFEST_EXPECTED_RESP} label="Expected JSON response" language="json" />
      </Section>

      {/* ── Function B ── */}
      <Section title="Function B — device-heartbeat (full source)" icon={<Code2 size={18} />}>
        <InfoBox type="info">
          File path in editor: <code>supabase/functions/device-heartbeat/index.ts</code> — paste the entire block below.
        </InfoBox>
        <CopyBlock code={HEARTBEAT_FN} label="device-heartbeat/index.ts" />

        <div style={{ fontWeight: 600, color: '#f1f5f9', marginBottom: '0.625rem', fontSize: '0.875rem' }}>Test cURL</div>
        <CopyBlock code={CURL_HEARTBEAT} label="Bash — test device-heartbeat" language="bash" />

        <div style={{ fontWeight: 600, color: '#f1f5f9', marginBottom: '0.625rem', fontSize: '0.875rem' }}>Expected response</div>
        <div style={{ background: '#0f172a', padding: '0.75rem', borderRadius: 8, fontFamily: 'monospace', fontSize: '0.75rem', color: '#94a3b8' }}>{'{ "ok": true }'}</div>
      </Section>

      {/* ── Function C ── */}
      <Section title="Function C — device-pairing (full source)" icon={<Zap size={18} />}>
        <InfoBox type="info">
          File path in editor: <code>supabase/functions/device-pairing/index.ts</code> — paste the entire block below.
        </InfoBox>
        <div style={{ marginBottom: '1rem', color: '#64748b', fontSize: '0.8125rem' }}>
          This function handles the simplified PIN-based pairing. A device shows a 6-digit code, and an admin enters it in the CMS to claim it.
        </div>
        <CopyBlock code={PAIRING_FN} label="device-pairing/index.ts" />

        <div style={{ fontWeight: 600, color: '#f1f5f9', marginBottom: '0.625rem', fontSize: '0.875rem' }}>Test cURL (Initialize PIN)</div>
        <CopyBlock code={CURL_PAIRING_INIT} label="Bash — initialize pairing" language="bash" />

        <div style={{ fontWeight: 600, color: '#f1f5f9', marginBottom: '0.625rem', fontSize: '0.875rem' }}>Test cURL (Claim PIN)</div>
        <CopyBlock code={CURL_PAIRING_CLAIM} label="Bash — claim device" language="bash" />
      </Section>

      {/* ── Function D ── */}
      <Section title="Function D — get-r2-upload-url (full source)" icon={<Code2 size={18} />}>
        <InfoBox type="info">
          File path in editor: <code>supabase/functions/get-r2-upload-url/index.ts</code> — paste the entire block below.
        </InfoBox>
        <InfoBox type="warn">
          <strong>Important:</strong> This function requires R2 Secrets (API Keys) to be set in the Supabase Dashboard.
        </InfoBox>
        <CopyBlock code={R2_UPLOAD_FN} label="get-r2-upload-url/index.ts" />

        <div style={{ fontWeight: 600, color: '#f1f5f9', marginBottom: '0.625rem', fontSize: '0.875rem' }}>Test cURL</div>
        <CopyBlock code={CURL_R2_UPLOAD} label="Bash — test R2 upload URL" language="bash" />
      </Section>

      {/* ── Env vars reference ── */}
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
                ['SUPABASE_ANON_KEY', 'Project Settings → API', 'Used by PlayerPage on the frontend (in .env)'],
                ['R2_ACCESS_KEY_ID', 'Cloudflare Dashboard', 'Required for Function D'],
                ['R2_SECRET_ACCESS_KEY', 'Cloudflare Dashboard', 'Required for Function D'],
                ['R2_BUCKET_NAME', 'Cloudflare Dashboard', 'Required for Function D'],
                ['R2_ENDPOINT', 'Cloudflare Dashboard', 'Required for Function D'],
              ].map(([v, val, how]) => (
                <tr key={v}>
                  <td><code style={{ fontFamily: 'monospace', color: '#7a8aff' }}>{v}</code></td>
                  <td><span className={val === 'Auto-injected' ? 'badge badge-green' : (val === 'Cloudflare Dashboard' ? 'badge badge-blue' : 'badge badge-gray')}>{val}</span></td>
                  <td style={{ color: '#94a3b8', fontSize: '0.8125rem' }}>{how}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── PlayerPage config ── */}
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
          Player URL format: <code style={{ color: '#7a8aff' }}>/player/:device_code</code> — e.g. <code style={{ color: '#7a8aff' }}>/player/DUB01_MAIN_001</code>.
          The Player will prompt for the device secret on first launch and save it in localStorage.
        </p>
      </Section>
    </div >
  )
}
