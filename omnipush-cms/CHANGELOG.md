# CHANGELOG - OmniPush Smart Retail Display System

All notable changes to the OmniPush Player and CMS project will be documented in this file.

---

## [1.3.0] - 2026-03-19
### 🚀 Added
- **Global Signage Reset**: Implemented high-priority CSS resets (`html`, `body`, `#root`) to ensure 100% viewport coverage.
- **Dynamic Viewport Sync**: Added React-level viewport meta-tag enforcement (`initial-scale=1.0`) to stop browser auto-zoom.
- **Advanced Admin Panel**: New 5-tap top-right corner access with secure PIN protection.
- **PIN for Admin Panel**: Set to `2580`.

### 🔧 Fixed
- **Browser Clipping**: Eliminated "clipping from all sides" issues on high-DPI displays and desktop browsers.
- **Mixed Content Transitions**: Optimized opacity-based fading for regions with mixed Image/Video/Web content.
- **Universal Aspect Ratio**: Switched all media containers to `object-fit: fill` to maximize region usage across non-standard display ratios.

---

## [1.2.0] - 2026-03-17
### 🚀 Added
- **High-Performance Android Injector (v18.0)**: Major refactor of the WebView JavaScript injector for Android.

### 🔧 Fixed
- **Android Playback Jitter**: Resolved jitter and "flash" issues on the Android player by removing conflicting WebView styles.
- **Overscan/Status Messages**: Removed unwanted "Syncing" messages and the looping "Play" icon from view.
- **Double-Buffer Stability**: Fixed `zIndex` and `opacity` layering in the video player to prevent hardware acceleration glitches.

---

## [1.1.0] - 2026-03-16
### 🚀 Added
- **Double-Buffer Video Engine**: Introduced the `DoubleBufferVideo` component for seamless, flash-free looping of cached assets.
- **Service Worker Caching v2**: Enhanced `hydrateAssetsFromCache` logic for more robust offline playback.

### 🔧 Fixed
- **Manifest Fallback Bug**: Corrected a TypeScript error where the fallback `url` was incorrectly accessed from `ManifestItem` instead of `ManifestAsset`.

---

## [1.0.0] - 2026-02-23
### 🚀 Added
- **Initial MVP Release**: Global signage framework with multi-region layouts, scheduling, and Supabase backend integration.
- **Core Player Logic**: Percentage-based region positioning for cross-resolution compatibility.
- **Offline Mode**: Local Storage manifest caching for playback during network outages.

---

> [!TIP]
> **Pro-Tip**: Use the "🗑️ Clear Cache & Reload" button in the Admin Panel (`5-tap` on top-right) if you encounter any unexpected CSS behavior after a version upgrade.
