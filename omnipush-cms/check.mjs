import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://qxialnmorewjgpmpcswr.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4aWFsbm1vcmV3amdwbXBjc3dyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODE0MTcsImV4cCI6MjA4NzM1NzQxN30.lVAQwqlWNURA2b7jfaL46OaU69BG5h1VOBQLT-8ZzJw'
);

async function run() {
    const { data: pl } = await supabase
        .from('playlists')
        .select('*')
        .ilike('name', '%main playlist%')
        .single();

    if (!pl) {
        console.log('No playlist named main playlist found.');
        process.exit(1);
    }
    console.log('Playlist:', pl.name, 'ID:', pl.id);

    const { data: items, error } = await supabase
        .from('playlist_items')
        .select('*')
        .eq('playlist_id', pl.id);

    if (error) {
        console.error('Error fetching items:', error);
    } else {
        console.dir(items, { depth: null });
    }
}

run().catch(console.error);
