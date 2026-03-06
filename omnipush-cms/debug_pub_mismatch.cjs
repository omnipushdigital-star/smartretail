const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = "https://qxialnmorewjgpmpcswr.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4aWFsbm1vcmV3amdwbXBjc3dyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODE0MTcsImV4cCI6MjA4NzM1NzQxN30.lVAQwqlWNURA2b7jfaL46OaU69BG5h1VOBQLT-8ZzJw";

const supabase = createClient(SUPABASE_URL, ANON_KEY);

async function check() {
    console.log("--- Device Detailed Check ---");
    const { data: device } = await supabase.from('devices').select('*, store:stores(id, name)').eq('device_code', 'BIRR_01').single();
    console.log("Device Store ID:", device?.store_id);
    console.log("Device Store Name:", device?.store?.name);
    console.log("Device Role ID:", device?.role_id);

    console.log("\n--- Active Publications for this Role ---");
    const { data: pubs } = await supabase.from('layout_publications')
        .select('*')
        .eq('is_active', true)
        .eq('role_id', device.role_id);

    console.log(pubs);
}

check();
