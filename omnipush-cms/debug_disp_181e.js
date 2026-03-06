
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://qxialnmorewjgpmpcswr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4aWFsbm1vcmV3amdwbXBjc3dyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODE0MTcsImV4cCI6MjA4NzM1NzQxN30.lVAQwqlWNURA2b7jfaL46OaU69BG5h1VOBQLT-8ZzJw';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDisp181E() {
    // 1. Get device
    const { data: device } = await supabase.from('devices').select('*').eq('device_code', 'DISP-181E').single();
    if (!device) { console.error('Device not found'); return; }

    // 2. Get active pub
    const { data: pubs } = await supabase
        .from('layout_publications')
        .select('*, bundles!fk_pub_bundle(id, version)')
        .eq('tenant_id', device.tenant_id)
        .eq('role_id', device.role_id)
        .eq('is_active', true);

    console.log('Active Pubs for DISP-181E:');
    console.table(pubs?.map(p => ({
        scope: p.scope,
        bundle_id: p.bundle_id,
        bundle_version: p.bundles?.version
    })));
}

checkDisp181E();
