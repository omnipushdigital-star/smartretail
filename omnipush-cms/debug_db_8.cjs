const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = "https://qxialnmorewjgpmpcswr.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4aWFsbm1vcmV3amdwbXBjc3dyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODE0MTcsImV4cCI6MjA4NzM1NzQxN30.lVAQwqlWNURA2b7jfaL46OaU69BG5h1VOBQLT-8ZzJw";

const supabase = createClient(SUPABASE_URL, ANON_KEY);

async function check() {
    console.log("--- Checking bundle files ---");
    const { data: files } = await supabase.from('bundle_files')
        .select('*')
        .eq('bundle_id', '30f1ac55-181c-41b4-9e34-f1cc1ea87762');

    console.log("Files count:", files?.length);
    const found = files?.find(f => f.media_id === '61c63dea-cf00-473e-a73a-ca6c021cd5e7');
    console.log("Found pizza item in bundle:", !!found);
}

check();
