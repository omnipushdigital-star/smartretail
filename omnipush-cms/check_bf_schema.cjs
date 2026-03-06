const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = "https://qxialnmorewjgpmpcswr.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4aWFsbm1vcmV3amdwbXBjc3dyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODE0MTcsImV4cCI6MjA4NzM1NzQxN30.lVAQwqlWNURA2b7jfaL46OaU69BG5h1VOBQLT-8ZzJw";

const supabase = createClient(SUPABASE_URL, ANON_KEY);

async function check() {
    console.log("--- Checking bundle_files schema via sample ---");
    const { data: sample } = await supabase.from('bundle_files').select('*').limit(1);
    console.log("Sample row:", sample);

    // Check if there are ANY rows in bundle_files at all
    const { count } = await supabase.from('bundle_files').select('*', { count: 'exact', head: true });
    console.log("Total rows in bundle_files:", count);
}

check();
