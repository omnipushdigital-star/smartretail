
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://qxialnmorewjgpmpcswr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4aWFsbm1vcmV3amdwbXBjc3dyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODE0MTcsImV4cCI6MjA4NzM1NzQxN30.lVAQwqlWNURA2b7jfaL46OaU69BG5h1VOBQLT-8ZzJw';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkStatus() {
    const { data, error } = await supabase
        .from('device_heartbeats')
        .select('device_code, status, current_version, last_seen_at')
        .eq('device_code', 'DISP-181E')
        .order('last_seen_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error('Error fetching heartbeats:', error);
        return;
    }

    console.log('Recent Heartbeats for DISP-181E:');
    console.table(data);
}

checkStatus();
