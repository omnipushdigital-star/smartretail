const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = "https://qxialnmorewjgpmpcswr.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4aWFsbm1vcmV3amdwbXBjc3dyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODE0MTcsImV4cCI6MjA4NzM1NzQxN30.lVAQwqlWNURA2b7jfaL46OaU69BG5h1VOBQLT-8ZzJw";

const supabase = createClient(SUPABASE_URL, ANON_KEY);

async function check() {
    console.log("--- Querying without join ---");
    const { data, error } = await supabase.from('playlist_items')
        .select('*')
        .eq('playlist_id', '15a6f627-36de-4b9c-8e9d-ee5f34f18db4');

    if (error) { console.error("Error:", error); }
    else { console.log("Data:", data); }
}

check();
