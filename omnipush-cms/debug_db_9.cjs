const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = "https://qxialnmorewjgpmpcswr.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4aWFsbm1vcmV3amdwbXBjc3dyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODE0MTcsImV4cCI6MjA4NzM1NzQxN30.lVAQwqlWNURA2b7jfaL46OaU69BG5h1VOBQLT-8ZzJw";

const supabase = createClient(SUPABASE_URL, ANON_KEY);

async function check() {
    console.log("--- Checking new bundle files ---");
    const { data: files } = await supabase.from('bundle_files')
        .select('*, media:media_assets(*)')
        .eq('bundle_id', '3ca5d9ea-dc7a-4d77-b008-3d799e469236');

    console.log("Files count:", files?.length);
    console.log(JSON.stringify(files, null, 2));

    console.log("\n--- Checking playlist items directly (no joins) ---");
    const { data: items } = await supabase.from('playlist_items')
        .select('*')
        .in('playlist_id', ['15a6f627-36de-4b9c-8e9d-ee5f34f18db4', '617e912c-1d8b-4dde-8ff8-56af5991d298']);
    console.log("Items count:", items?.length);
    console.log(JSON.stringify(items, null, 2));
}

check();
