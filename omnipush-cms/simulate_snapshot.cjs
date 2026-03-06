const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = "https://qxialnmorewjgpmpcswr.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4aWFsbm1vcmV3amdwbXBjc3dyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODE0MTcsImV4cCI6MjA4NzM1NzQxN30.lVAQwqlWNURA2b7jfaL46OaU69BG5h1VOBQLT-8ZzJw";

const supabase = createClient(SUPABASE_URL, ANON_KEY);

async function check() {
    const layoutId = 'fa56e6aa-629b-435e-8a13-4b2720835c3b';

    console.log("--- 1. Region Maps ---");
    const { data: regionMaps } = await supabase
        .from('layout_region_playlists')
        .select('playlist_id')
        .eq('layout_id', layoutId);
    console.log(regionMaps);

    const playlistIds = (regionMaps || []).map(r => r.playlist_id).filter(Boolean);
    console.log("Playlist IDs:", playlistIds);

    console.log("\n--- 2. Playlist Items ---");
    const { data: items } = await supabase
        .from('playlist_items')
        .select('id, media_id, web_url, type')
        .in('playlist_id', playlistIds);
    console.log(items);

    const mediaItems = items.filter(i => i.media_id);
    console.log("Media Items Found:", mediaItems.length);
}

check();
