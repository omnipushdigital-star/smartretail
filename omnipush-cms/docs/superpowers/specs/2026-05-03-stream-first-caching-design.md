# Stream-First Caching Design

## Goal

Start playing content immediately when the manifest arrives. Cache assets in the background. Never show a black screen while waiting for downloads.

## Background

Today `syncAssets` downloads every non-video asset to IndexedDB **before** calling `setManifest` and `setPhase('playing')`. On a first-boot with a fresh playlist the device shows a black loading screen for the entire duration of the downloads — seconds to minutes depending on asset count and network speed.

## Architecture

Two-phase asset hydration inside `syncAssets`:

**Phase 1 — Instant hydration (synchronous, no network)**
1. Call `hydrateAssetsFromCache(data.assets)` — reads IndexedDB for every asset, returns blob: URLs for anything already cached, HTTPS URLs for everything else.
2. Call `setManifest({ ...data, assets: hydratedAssets })` with the partial result.
3. Call `setPhase('playing')` immediately. The loading screen disappears.

**Phase 2 — Background download (async, parallel)**
1. Filter `hydratedAssets` for any entry that still holds an HTTPS URL (not yet cached).
2. Kick off `Promise.allSettled` across all uncached assets using `downloadAndCache`.
3. Track progress with `setSyncProgress` — shown as a non-blocking small indicator, not a gate.
4. When all settle, collect the successful blob: URLs and call `setManifest` once more with the fully-resolved asset list.
5. `getItemData`'s `useCallback([assets])` dependency picks up the new URLs. Each item silently upgrades to its cached blob: URL on its next rotation. No visual interruption.

## Invariants preserved

- Videos are never given blob: URLs (excluded from both phases — `hydrateAssetsFromCache` already skips `video` and `video/*` types).
- `nativeAssetsRef.current` is set before `syncAssets` runs (existing ordering unchanged).
- HTML assets are excluded from blob hydration (relative paths break inside blob: context).
- On offline boot: Phase 1 returns blob: URLs for everything already in IndexedDB. Phase 2 download attempts fail silently (`downloadAndCache` CORS/network fallback returns the original HTTPS URL). Items with no cached URL attempt to load from HTTPS — if that also fails, `onError` skips the item and the player advances.

## Files changed

| File | Change |
|------|--------|
| `src/pages/PlayerPage.tsx` | Refactor `syncAssets`: Phase 1 immediate apply, Phase 2 parallel background downloads |
| `src/lib/cache.ts` | No changes |
| Android `MediaCacheManager.kt` | No changes |
| Android `AndroidHealth.kt` | No changes |

## What does NOT change

- The `<LoadingState>` component and `syncProgress` state remain. Progress now shows as a non-blocking indicator during Phase 2 rather than gating the loading screen. (Full loading screen redesign is a separate spec — issue #2.)
- All CLAUDE.md critical invariants (video blob: exclusion, nativeAssetsRef ordering, ExoPlayer TextureView, WebView background rules) are untouched.
- Desktop/browser players are unaffected — the change is purely in orchestration order, not in what gets cached.

## Success criteria

1. On first boot with no cache: device shows content within 2 seconds of manifest arrival (playing from HTTPS URLs).
2. On repeat boot with full cache: device shows content within 2 seconds of manifest arrival (playing from blob: URLs immediately from Phase 1).
3. On offline boot: device shows any previously cached content without network access.
4. After background downloads complete: no visible flash, glitch, or interruption during the silent HTTPS → blob: URL swap.
5. `syncProgress` indicator disappears once Phase 2 completes.
