const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = "https://qxialnmorewjgpmpcswr.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4aWFsbm1vcmV3amdwbXBjc3dyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODE0MTcsImV4cCI6MjA4NzM1NzQxN30.lVAQwqlWNURA2b7jfaL46OaU69BG5h1VOBQLT-8ZzJw";

const supabase = createClient(SUPABASE_URL, ANON_KEY);

async function check() {
    const bundle_id = 'e1c05f1a-7961-4fee-bae5-33349d35416c';
    const media_id = '61c63dea-cf00-473e-a73a-ca6c021cd5e7';

    console.log("--- Attempting manual insert into bundle_files ---");
    const { data, error } = await supabase.from('bundle_files').insert({
        bundle_id,
        media_id
    });

    if (error) {
        console.error("Insert failed:", error.message);
    } else {
        console.log("Insert success!");
    }
}

check();
