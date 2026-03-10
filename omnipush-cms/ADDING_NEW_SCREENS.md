# How to Add a New Screen to OmniPush 📺

Now that we've optimized the workflow and implemented Name-to-URL sync, here is the official 2-minute process for adding a new display to your network.

---

## Method 1: The "Pairing Code" Method (Fastest)
*Best for when you have the physical screen in front of you.*

1.  **On the Physical TV/Player:** 
    *   Open the OmniPush Player app. It will show a **6-digit Pairing PIN** (e.g., `582 910`).
2.  **In the CMS Dashboard:**
    *   Go to **Devices** → Click **"Pair with Code"** (the blue TV icon).
    *   Enter the 6-digit PIN from the TV.
3.  **Configure:** 
    *   The CMS will immediately open a window. Give the screen a **Display Name** (e.g., "Main Lobby Left").
    *   *Tip: With "Auto-sync URL" enabled, your Device URL will automatically become `MAIN_LOBBY_LEFT`.* 
    *   Assign a **Store** and **Role** and click **Save**.

---

## Method 2: Manual Registration (Pre-Provisioning)
*Best for when you want to set up the CMS before the screen arrives on site.*

1.  **In the CMS Dashboard:**
    *   Go to **Devices** → Click **"+ Add Device"**.
2.  **Set Identifiers:**
    *   Enter a **Display Name**. Notice that the **Device Code (URL)** updates automatically.
    *   Assign the **Store** and **Role**.
3.  **Get Credentials:**
    *   Click **Register Device**. A popup will show a **QR Code** and a **Device Secret**.
    *   **CRITICAL:** Save the **Device Secret**! It will not be shown again.
4.  **Pairing the Screen:**
    *   When the TV is ready, either scan the **QR Code** with the TV's camera OR manually enter the **Device Code** and **Secret** in the TV's settings menu.

---

## After Adding the Screen (The Magic) 🪄
Once paired, the screen will:
1.  **Automatically Download** the latest content based on the **Role** you assigned (e.g., if you assigned the "Menu" role, it will immediately start showing the menu layout).
2.  **Report Status**: You will see it turn **"Online"** (Green dot) in your Monitoring dashboard within 30 seconds.
3.  **Media Sync**: It will download high-speed media directly from your Cloudflare R2 bucket.

---

## Recovering a Deleted Screen 🗑️
If a device was accidentally deleted, it is moved to the **"Trash Bin"** (Soft Delete).

1.  **To Restore Manually:**
    *   Go to **Devices**.
    *   Click the **Trash Icon** (top right) to view deleted devices.
    *   Click the **Restore** button next to your device. It will immediately reappear in your active list and start playing content again.
2.  **To Restore by Re-pairing:**
    *   If you've already wiped the TV and it screen shows a new Pairing PIN, simply follow the **Pairing Code** method above. 
    *   The system will automatically detect the old record in the bin and restore it for you!

---

> [!IMPORTANT]
> **Pro-Tip**: Because you have **Name-to-URL sync** enabled, if you ever need to manually access the player link in a browser, it will always be:
> `https://signage.omnipushdigital.com/player/YOUR_SCREEN_NAME`
