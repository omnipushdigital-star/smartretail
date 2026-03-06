const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = "https://qxialnmorewjgpmpcswr.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4aWFsbm1vcmV3amdwbXBjc3dyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODE0MTcsImV4cCI6MjA4NzM1NzQxN30.lVAQwqlWNURA2b7jfaL46OaU69BG5h1VOBQLT-8ZzJw";

const supabase = createClient(SUPABASE_URL, ANON_KEY);

async function check() {
    console.log("--- All Playlists ---");
    const { data: playlists } = await supabase.from('playlists').select('id, name');
    console.log(playlists);

    console.log("\n--- All Playlist Items count per playlist ---");
    const { data: counts } = await supabase.from('playlist_items').select('playlist_id');
    const tally = {};
    counts.forEach(c => tally[c.playlist_id] = (tally[c.playlist_id] || 0) + 1);
    console.log(tally);
}

check();
