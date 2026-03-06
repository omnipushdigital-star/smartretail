
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://qxialnmorewjgpmpcswr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4aWFsbm1vcmV3amdwbXBjc3dyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODE0MTcsImV4cCI6MjA4NzM1NzQxN30.lVAQwqlWNURA2b7jfaL46OaU69BG5h1VOBQLT-8ZzJw';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkBundles() {
    const { data: pubs, error: pubErr } = await supabase
        .from('layout_publications')
        .select('*, bundles!fk_pub_bundle(id, name, version), devices!fk_pub_device(device_code)')
        .eq('is_active', true);

    if (pubErr) {
        console.error('Error fetching publications:', pubErr);
        return;
    }

    console.log('Active Publications and Bundle Versions:');
    const results = pubs.map(p => ({
        device: p.devices?.device_code || p.scope,
        bundle_name: p.bundles?.name,
        bundle_version: p.bundles?.version
    }));
    console.table(results);
}

checkBundles();
