
const SUPABASE_URL = "https://qxialnmorewjgpmpcswr.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4aWFsbm1vcmV3amdwbXBjc3dyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODE0MTcsImV4cCI6MjA4NzM1NzQxN30.lVAQwqlWNURA2b7jfaL46OaU69BG5h1VOBQLT-8ZzJw";

async function testManifest() {
    const payload = {
        device_code: "WAS-SNKM",
        device_secret: "abc258b7-617b-42d1-a959-b8a304f63e82"
    };

    console.log("Testing device-manifest with payload:", JSON.stringify(payload, null, 2));

    try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/device-manifest`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${ANON_KEY}`
            },
            body: JSON.stringify(payload)
        });

        const status = res.status;
        const data = await res.json();
        console.log(`Response Status: ${status}`);
        console.log("Response Body:", JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("Fetch error:", err);
    }
}

testManifest();
