
const SUPABASE_URL = "https://qxialnmorewjgpmpcswr.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4aWFsbm1vcmV3amdwbXBjc3dyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODE0MTcsImV4cCI6MjA4NzM1NzQxN30.lVAQwqlWNURA2b7jfaL46OaU69BG5h1VOBQLT-8ZzJw";

async function createSplitTemplate() {
    const splitTemplate = {
        name: 'Split 70/30 (Main + Sidebar)',
        description: 'A two-region layout with a 70% main area and a 30% sidebar.',
        regions: [
            { id: 'main', x: 0, y: 0, width: 70, height: 100, label: 'Main Content (70%)' },
            { id: 'sidebar', x: 70, y: 0, width: 30, height: 100, label: 'Sidebar (30%)' }
        ],
        is_default: false
    };

    console.log("Creating split template...");

    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/layout_templates`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': ANON_KEY,
                'Authorization': `Bearer ${ANON_KEY}`,
                'Prefer': 'return=representation'
            },
            body: JSON.stringify(splitTemplate)
        });

        const status = res.status;
        const data = await res.json();
        console.log(`Response Status: ${status}`);
        console.log("Response Body:", JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("Fetch error:", err);
    }
}

createSplitTemplate();
