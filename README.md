# OmniPush Smart Retail Display System

Comprehensive signage management platform featuring a React-based CMS/Player and a Native Android Player app.

## Project Structure

- **`/omnipush-cms`**: The core web application built with **React, Vite, and TailwindCSS**. 
  - Admin Dashboard for device management, playlist scheduling, and content design.
  - Player interface for browser-based signage.
- **`/supabase`**: Edge Functions and Database configuration for device-manifests and heartbeats.
- **Android App**: (Managed in `C:\Users\Naveen Saini\AndroidProjects\SmartRetailPlayer`) Native Kotlin app with Kiosk lockdown and ExoPlayer integration.

## Key Features

- **Double-Buffer Playback**: Gapless video transitions using a synchronized buffer engine.
- **Intelligent Scheduling**: Real-time content updates via Supabase Edge functions.  
- **Remote Commands**: Dashboard-triggered Reboot, Clear Cache, and Screenshot functionality.
- **Device Health**: Detailed heartbeat monitoring (RAM, Storage, WebView version, Uptime).

## Setup & Deployment

1. **CMS**: `npm run dev -- --host` for local testing on physical boxes.
2. **Supabase**: `supabase functions deploy device-manifest` to sync scheduling logic.
3. **Android**: Build APK and deploy via ADB: `adb install -r SmartRetailPlayer.apk`.

## Optimized Versions

- **v1.1.2 (Active)**: Optimizations for Droidlogic Android 11 TV Boxes with WebView hardware acceleration and Autoplay Unlock bridge.

---
© 2026 OmniPush Digital
