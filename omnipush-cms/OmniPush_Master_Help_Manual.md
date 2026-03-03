# 📘 OmniPush Smart Retail Display System - Master Help Manual

This manual provides a detailed, step-by-step breakdown of every process within the OmniPush CMS, intended for Super Administrators and Tenant Operators.

---

## 🏗️ 1. Core Architecture & Technical Setup
OmniPush is built on a high-availability, edge-first architecture using **Supabase** and **React**.

### 1.1 First-Time Deployment
1.  **Database Migration**:
    *   Navigate to `Admin → DB Migration`.
    *   Execute SQL Blocks A through D in the Supabase SQL Editor.
    *   *Why?* This establishes multi-tenant uniqueness and the publication override logic.
2.  **Edge Function Deployment**:
    *   Navigate to `Admin → Edge Functions`.
    *   Copy the source code for `device-manifest` and `device-heartbeat`.
    *   Deploy these using the Supabase CLI (`supabase functions deploy ...`).
    *   *Why?* These functions are the "Brain" that resolves content for the players on the field.

---

## 🏢 2. Multi-Tenant Operations (Super Admin)
For managing multiple clients (e.g., Starbucks, Apache Pizza) under one infrastructure.

### 2.2 Switching Between Tenants
There are two primary ways to switch your active organization:

1.  **Global Header Switcher**:
    *   Click on the **"ACTIVE INSTANCE"** button in the top right corner of the dashboard.
    *   A dropdown will appear listing all your onboarded organizations.
    *   Select the tenant you wish to manage. The system will instantly refresh with that tenant's stores and media.
2.  **Global Admin Table**:
    *   Navigate to `Global (Admin)` (or use the **"Manage All Tenants"** shortcut in the header).
    *   In the **Tenant Performance Review** table, you will see a list of all organizations.
    *   Click the **"Switch"** button (with the arrow icon) in the **Action** column for the tenant you want to enter.

> [!TIP]
> **Missing Tenants?**: If you just onboarded a new tenant and don't see it in the header switcher, the list will automatically refresh. You can always find your full list in the `Global (Admin)` page.

---

## 🎨 3. Tenant Personalization (Tenant Admin)
Each tenant can customize the CMS look and feel.

### 3.1 Branding & White-Labeling
1.  Navigate to `Branding` (formerly Onboarding).
2.  **Upload Logo**: The system will automatically extract the **Primary** and **Secondary** colors from your logo.
3.  **Manual Tweak**: Adjust the HSL/HEX codes if needed.
4.  **Save**: The entire CMS UI (sidebar, buttons, accents) will instantly update to match the tenant's brand.

---

## 📺 4. Device Lifecycle Management
From unboxing a new screen to live content playback.

### 4.1 Pairing a Device (PIN-Based)
1.  **On the Screen**: Launch the Player app. You will see a 6-digit code.
2.  **In the CMS**: Go to `Devices` → **Pair New Device**.
3.  Enter the PIN and name the device (e.g., "Front Counter 01").
4.  Assign it to a **Store** and a **Role** (e.g., "Menu Board").
5.  **Success**: The device is now securely linked to your tenant via a `device_secret`.

### 4.2 Monitoring Health
1.  Go to `Monitoring`.
2.  Check the **Heartbeat** status.
3.  Green = Online (Heartbeat within 60s).
4.  Red/Yellow = Offline (Check internet or power).

---

## 🎬 5. The Content Content Lifecycle
The process of getting an image from your computer to the TV screen follows a 4-step chain.

### Step 1: Media Library (Assets)
*   Upload your JPG, PNG, or MP4 files.
*   **Best Practice**: Keep videos under 1080p/50MB for faster edge caching.

### Step 2: Playlists (Sequencing)
*   Create a playlist (e.g., "Breakfast Specials").
*   Drag and drop media items.
*   Set **Duration** for images (default 8s). Videos play in full.

### Step 3: Layouts (Design)
*   Pick a **Template** (e.g., 2-Zone Vertical).
*   Map a **Playlist** to each **Region ID** (e.g., `MainZone` → Promo Video, `SideZone` → Menu List).

### Step 4: Publishing (Targeting)
*   Choose where to push the content using the **Override Priority**:
    1.  **DEVICE Scope**: Only shows on ONE specific screen.
    2.  **STORE Scope**: Shows on all screens in a specific location with a specific Role.
    3.  **GLOBAL Scope**: The fallback content for all screens of that Role across the whole company.

---

## 🌯 6. The Digital Menu Builder (Specialized Content)
A drag-and-drop editor for high-performance retail menus.

### 6.1 Building Your Menu
1.  Navigate to **Menu Builder** in the sidebar.
2.  **Categories**: Click **+ Add New Category** (e.g., "Main Course").
3.  **Items**: Add products with names, descriptions, and prices.
4.  **Formatting**: Categories can be collapsed/expanded for a cleaner editing workspace.

### 6.2 Designing for the Screen (Layout Adjustments)
1.  Click the **Design & Layout** tab in the editor.
2.  **Zones**: Choose between **Full Screen** or **Multi-Zone (Split)**.
    *   *Split Mode* creates a "Promo Zone" (30% width) for looping advertisements.
3.  **Columns**: Set to **1, 2, or 3 columns** depending on your item density.
4.  **Branding**: Adjust the **Logo Placement** (Left/Center/Right) to match your store's style.

### 6.3 Displaying the Menu on Screens
The Menu Builder is integrated into your standard content lifecycle:
1.  **Register as Media**: When you click **Save** or **Push Content**, the system automatically creates a special **Dynamic Web Asset** in your **Media Library** named `MENU: [Your Menu Name]`.
2.  **Add to Playlist**: Go to `Playlists` and add the "MENU" item just like any other image or video.
3.  **Publish**: In the `Publish` page, assign the playlist containing your menu to your devices or stores.

> [!NOTE]
> **Real-time Updates**: Once a menu is published, any changes you make in the Menu Builder and **Save** will be updated on the physical screens automatically within 30-60 seconds without requiring a republish.

---

## 🛠️ 7. Troubleshooting & Diagnostics
If a screen is blank or behaving unexpectedly:

### 7.1 Diagnostic Overlay (The "Pro" Trick)
1.  Connect a keyboard to the player device.
2.  Press **`SHIFT + D`**.
3.  **Check Scope**: Is it resolving to the correct Layout?
4.  **Check Assets**: Are any assets failing to download?
5.  **Check Peer ID**: Ensure the `tenant_id` matches your organization.

### 6.2 Common Discrepancies
*   **Blank Screen after pairing**: This usually means a Device is paired but no **Publication** has been set for its **Role**. Go to `Publish` and create a Global or Store-level publication.
*   **Media not showing**: Check if the signed URL has expired. The player polls every 30s-120s to refresh these automatically.

---

## 📈 8. Business Continuity & ROI
The `Global Management` page provides financial matrices for data-driven decisions.

*   **Total Revenue**: Calculated based on `$19.99/screen`.
*   **System Uptime**: 24-hour heartbeat check across all tenants.
*   **Performance Review**: High-level table showing which tenants have the most active publications and highest uptime.

---

**Contact Support**: `tech-ops@omnipush-digital.com`
**Version**: 2.1.0 
**Last Updated**: February 2026
