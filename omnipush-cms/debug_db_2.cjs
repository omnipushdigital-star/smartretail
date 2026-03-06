const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = "https://qxialnmorewjgpmpcswr.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4aWFsbm1vcmV3amdwbXBjc3dyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODE0MTcsImV4cCI6MjA4NzM1NzQxN30.lVAQwqlWNURA2b7jfaL46OaU69BG5h1VOBQLT-8ZzJw";

const supabase = createClient(SUPABASE_URL, ANON_KEY);

async function check() {
    console.log("--- Layout ID Info ---");
    const { data: layout } = await supabase.from('layouts').select('*').eq('id', 'fa56e6aa-629b-435e-8a13-4b2720835c3b').single();
    console.log("Layout:", layout);

    console.log("\n--- All Region Mappings for ALL Layouts (to see what we have) ---");
    const { data: allMaps } = await supabase.from('layout_region_playlists').select('*, layout:layouts(name)');
    console.log(allMaps);
}

check();
