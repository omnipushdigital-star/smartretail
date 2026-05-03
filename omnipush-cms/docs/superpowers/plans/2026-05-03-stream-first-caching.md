# Stream-First Caching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start playing content immediately when the manifest arrives — cache assets in the background instead of blocking playback on downloads.

**Architecture:** Two-phase hydration inside `fetchManifest`. Phase 1 reads IndexedDB synchronously and applies the manifest immediately (blob: URLs for already-cached assets, HTTPS for the rest). Phase 2 downloads uncached assets in parallel as a fire-and-forget task and swaps in blob: URLs with a single `setManifest` functional update when all complete. The old sequential `syncAssets` function is removed entirely.

**Tech Stack:** React 19, TypeScript, IndexedDB via `cacheDb` / `hydrateAssetsFromCache` / `downloadAndCache` (src/lib/cache.ts), Vite.

---

## File Map

| File | What changes |
|------|-------------|
| `omnipush-cms/src/pages/PlayerPage.tsx` | Remove `syncAssets` function; replace blocking sync block in `fetchManifest` with Phase 1 + Phase 2; remove `syncAssets` from deps; add background-sync progress overlay on playing screen |

No other files change.

---

### Task 1: Remove the blocking `syncAssets` function

**Files:**
- Modify: `omnipush-cms/src/pages/PlayerPage.tsx` (around line 1759–1810)

The `syncAssets` `useCallback` is a sequential download loop that blocks the caller. After this task it is gone. The two-phase logic in Task 2 replaces it.

- [ ] **Step 1: Delete `syncAssets`**

Find and delete this entire block (approximately lines 1759–1810 — the block starts with `const syncAssets = useCallback` and ends with `}, [])`):

```typescript
    const syncAssets = useCallback(async (assetsToSync: ManifestAsset[]): Promise<ManifestAsset[]> => {
        if (!assetsToSync || assetsToSync.length === 0) return assetsToSync

        const assetsToActuallySync = assetsToSync.filter(a => {
            // HTML assets are always served from origin URL — blob: URLs break relative paths inside the file
            if (a.type === 'html') return false
            // file:// URLs are already on native storage — fetch() cannot open them in WebView
            if (a.url?.startsWith('file://')) return false
            return a.url && !a.url.startsWith('blob:')
        })

        if (assetsToActuallySync.length === 0) {
            console.log('[Cache] All assets already cached or skipped.')
            return assetsToSync
        }

        console.log(`[Cache] Syncing ${assetsToActuallySync.length} assets...`)
        setSyncProgress({ current: 0, total: assetsToActuallySync.length })

        const updatedAssets = [...assetsToSync]
        let completed = 0

        for (const asset of assetsToActuallySync) {
            const idx = updatedAssets.findIndex(a => a.media_id === asset.media_id)
            try {
                const blobUrl = await downloadAndCache({
                    media_id: asset.media_id,
                    url: asset.url!,
                    type: asset.type,
                    checksum_sha256: asset.checksum_sha256
                })

                // Skip blob hydration for PPT/Presentation and video types.
                // Native HW decoders (Amlogic S905W2) and ExoPlayer cannot use blob: URIs.
                // Videos rely on WebView/ExoPlayer HTTP disk caching instead.
                const isVideo = asset.type === 'video' || asset.type.startsWith('video/')
                if (asset.type !== 'ppt' && asset.type !== 'presentation' && !isVideo) {
                    if (idx !== -1) updatedAssets[idx] = { ...asset, url: blobUrl }
                }
            } catch (err: any) {
                const reason = err?.message || (typeof err === 'string' ? err : 'Network/CORS blocked')
                console.error(`[Cache] Sync FAILED for ${asset.media_id} (${asset.type}): ${reason} | URL: ${asset.url}`)
                // On failure: keep the remote URL so playback can still stream as fallback
            } finally {
                completed++
                setSyncProgress({ current: completed, total: assetsToActuallySync.length })
            }
        }

        setTimeout(() => setSyncProgress(null), 2000)
        return updatedAssets // Caller applies this to manifest — do NOT call setManifest here
    }, [])
```

- [ ] **Step 2: Verify TypeScript still compiles (expect errors — they are fixed in Task 2)**

```bash
cd omnipush-cms && npx tsc --noEmit 2>&1 | head -20
```

Expected: errors mentioning `syncAssets` not found. That is correct — Task 2 removes those references.

---

### Task 2: Replace the blocking sync block with two-phase hydration

**Files:**
- Modify: `omnipush-cms/src/pages/PlayerPage.tsx` (the block inside `fetchManifest` that currently reads `// ── Download all assets to IndexedDB before applying manifest ──`)

- [ ] **Step 1: Find the block to replace**

Locate this comment and the code below it (it starts `let manifestToApply = data`):

```typescript
            // ── Download all assets to IndexedDB before applying manifest ──
            // Guarantees UDB always initializes with blob: URLs (never remote CDN).
            // isSyncingRef prevents concurrent syncs when polls overlap during a long download.
            // localStorage always stores remote URLs so offline re-hydration works after reboot.
            let manifestToApply = data
            if (data.assets && !isSyncingRef.current) {
                // assetsToUse always keeps original HTTPS URLs — WebView cannot load
                // file:// URLs from an HTTPS origin (security restriction).
                const assetsToUse = data.assets

                if (IS_ANDROID_NATIVE) {
                    const ah = (window as any).AndroidHealth
                    // Trigger background download of all assets on the native side
                    if (ah?.syncAssetsFromManifest) {
                        ah.syncAssetsFromManifest(JSON.stringify(data.assets))
                    }
                    // INVARIANT: nativeAssetsRef set BEFORE syncAssets.
                    // Merge file:// paths into nativeAssetsRef ONLY — ExoPlayer reads these.
                    // file:// never goes into assetsToUse/WebView rendering pipeline.
                    try {
                        const localMap: Record<string, string> = ah?.getLocalAssetMap
                            ? JSON.parse(ah.getLocalAssetMap())
                            : {}
                        nativeAssetsRef.current = data.assets.map((a: any) =>
                            localMap[a.media_id] ? { ...a, url: localMap[a.media_id] } : a
                        )
                    } catch (e) {
                        nativeAssetsRef.current = data.assets
                    }
                } else {
                    // INVARIANT: nativeAssetsRef set BEFORE syncAssets.
                    nativeAssetsRef.current = assetsToUse
                }

                isSyncingRef.current = true
                try {
                    const blobAssets = await syncAssets(assetsToUse)
                    manifestToApply = { ...data, assets: blobAssets }
                } finally {
                    isSyncingRef.current = false
                }
            } else if (data.assets && isSyncingRef.current) {
                console.log('[Player] Asset sync already in progress — applying manifest with current URLs.')
            }
```

- [ ] **Step 2: Replace it with the two-phase block**

Replace the entire block above with:

```typescript
            // ── Stream-First Asset Hydration ──────────────────────────────────────────
            // Phase 1 (instant): read IndexedDB — blob: for cached assets, HTTPS for new ones.
            //   Apply manifest immediately. setPhase('playing') fires without waiting for downloads.
            // Phase 2 (background): download uncached assets in parallel. When all complete,
            //   a single setManifest() functional update swaps HTTPS → blob: URLs silently.
            //   getItemData() picks up the new URLs on the next rotation (useCallback([assets])).
            // INVARIANTS (CLAUDE.md):
            //   • Videos never get blob: URLs — excluded from both phases.
            //   • nativeAssetsRef is set before any sync runs (preserved below).
            //   • file:// paths only go into nativeAssetsRef, never into manifest.assets.
            //   • WiFi offline indicator is untouched — offline/setOffline state not modified here.
            let manifestToApply = data

            if (data.assets && !isSyncingRef.current) {
                const assetsToUse = data.assets

                // INVARIANT: nativeAssetsRef set BEFORE any sync (CLAUDE.md invariant #2)
                if (IS_ANDROID_NATIVE) {
                    const ah = (window as any).AndroidHealth
                    if (ah?.syncAssetsFromManifest) {
                        ah.syncAssetsFromManifest(JSON.stringify(data.assets))
                    }
                    try {
                        const localMap: Record<string, string> = ah?.getLocalAssetMap
                            ? JSON.parse(ah.getLocalAssetMap())
                            : {}
                        nativeAssetsRef.current = data.assets.map((a: any) =>
                            localMap[a.media_id] ? { ...a, url: localMap[a.media_id] } : a
                        )
                    } catch (e) {
                        nativeAssetsRef.current = data.assets
                    }
                } else {
                    nativeAssetsRef.current = assetsToUse
                }

                // Phase 1: instant IndexedDB hydration — no network, no waiting.
                const hydratedAssets = await hydrateAssetsFromCache(assetsToUse)
                manifestToApply = { ...data, assets: hydratedAssets }

                // Phase 2: download assets that are still on HTTPS (not yet in IndexedDB).
                // Exclude: videos (ExoPlayer/HTTPS only), html (blob: breaks relative paths),
                //          already-cached blob: URLs, native file:// URLs.
                const uncached = hydratedAssets.filter(a =>
                    a.url &&
                    !a.url.startsWith('blob:') &&
                    !a.url.startsWith('file://') &&
                    a.type !== 'html' &&
                    a.type !== 'video' &&
                    !a.type.startsWith('video/')
                )

                if (uncached.length > 0) {
                    isSyncingRef.current = true
                    setSyncProgress({ current: 0, total: uncached.length })

                    // Fire-and-forget: do NOT await. fetchManifest returns immediately
                    // so bootFetch can call setPhase('playing') without delay.
                    ;(async () => {
                        let completed = 0
                        const blobMap: Record<string, string> = {}
                        try {
                            await Promise.allSettled(
                                uncached.map(async (asset) => {
                                    try {
                                        const blobUrl = await downloadAndCache({
                                            media_id: asset.media_id,
                                            url: asset.url!,
                                            type: asset.type,
                                            checksum_sha256: asset.checksum_sha256
                                        })
                                        // Only store genuine blob: URLs — downloadAndCache may
                                        // return the original HTTPS URL as a CORS/network fallback.
                                        if (blobUrl.startsWith('blob:')) {
                                            blobMap[asset.media_id] = blobUrl
                                        }
                                    } catch (err: any) {
                                        console.error(`[Cache] BG download failed for ${asset.media_id}: ${err?.message}`)
                                    } finally {
                                        completed++
                                        setSyncProgress({ current: completed, total: uncached.length })
                                    }
                                })
                            )

                            // Single manifest update — HTTPS URLs replaced by blob: URLs.
                            // Functional update reads current state so stale-closure is not an issue.
                            setManifest(prev => {
                                if (!prev) return prev
                                const updatedAssets = prev.assets.map(a =>
                                    blobMap[a.media_id] ? { ...a, url: blobMap[a.media_id] } : a
                                )
                                return { ...prev, assets: updatedAssets }
                            })

                            console.log(`[Cache] BG sync done: ${Object.keys(blobMap).length}/${uncached.length} cached.`)
                            setTimeout(() => setSyncProgress(null), 2000)
                        } finally {
                            isSyncingRef.current = false
                        }
                    })()
                }
            } else if (data.assets && isSyncingRef.current) {
                console.log('[Player] Asset sync already in progress — applying manifest with current URLs.')
            }
```

- [ ] **Step 3: Remove `syncAssets` from `fetchManifest`'s `useCallback` dependency array**

Find this line near the end of `fetchManifest`:

```typescript
    }, [dc, syncAssets, initPairing])
```

Replace with:

```typescript
    }, [dc, initPairing])
```

- [ ] **Step 4: Verify TypeScript compiles clean**

```bash
cd omnipush-cms && npx tsc --noEmit 2>&1
```

Expected output: no errors. If there are errors, they will name the offending line — fix them before continuing.

- [ ] **Step 5: Verify the build succeeds**

```bash
cd omnipush-cms && npm run build 2>&1 | tail -15
```

Expected: `✓ built in X.XXs` with no TypeScript or Vite errors.

- [ ] **Step 6: Commit**

```bash
cd omnipush-cms && git add src/pages/PlayerPage.tsx
git commit -m "feat: stream-first caching — play immediately, cache in background"
```

---

### Task 3: Add a non-blocking background-sync progress indicator

**Files:**
- Modify: `omnipush-cms/src/pages/PlayerPage.tsx` (the playing-screen render block, around the `{offline && <WifiOff>}` overlay)

Right now `syncProgress` feeds into `<LoadingState>` which is only visible during `phase === 'loading'`. After Task 2, `phase` is set to `'playing'` before background downloads start, so the indicator is never seen. This task adds a tiny fixed overlay that shows only during `phase === 'playing'` while `syncProgress` is non-null.

- [ ] **Step 1: Find the offline overlay in the playing-screen render**

Locate this block (it is inside the `return (...)` of `renderMain`, inside the playing-phase `<div>`):

```tsx
                {/* Overlays */}
                {offline && (
                    <div style={{
                        position: 'fixed',
                        top: 32,
                        right: 32,
                        zIndex: 10000,
                        color: '#ef4444',
                        opacity: 0.6,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        pointerEvents: 'none'
                    }}>
                        <WifiOff size={32} strokeWidth={2.5} />
                    </div>
                )}
```

- [ ] **Step 2: Add the sync progress overlay immediately after the WiFi overlay**

Insert this block directly after the closing `)}` of the WiFi overlay:

```tsx
                {/* Background cache sync indicator — disappears when downloads complete */}
                {syncProgress && (
                    <div style={{
                        position: 'fixed',
                        bottom: 16,
                        right: 16,
                        zIndex: 10000,
                        background: 'rgba(0,0,0,0.55)',
                        color: '#94a3b8',
                        fontSize: '0.6rem',
                        padding: '3px 7px',
                        borderRadius: 4,
                        fontFamily: 'monospace',
                        pointerEvents: 'none',
                        letterSpacing: '0.03em',
                    }}>
                        ↓ {syncProgress.current}/{syncProgress.total}
                    </div>
                )}
```

- [ ] **Step 3: Build and verify no TypeScript errors**

```bash
cd omnipush-cms && npm run build 2>&1 | tail -10
```

Expected: clean build.

- [ ] **Step 4: Commit**

```bash
cd omnipush-cms && git add src/pages/PlayerPage.tsx
git commit -m "feat: show background cache progress overlay during playback"
```

---

### Task 4: Deploy and verify on device

- [ ] **Step 1: Deploy to Vercel production**

```bash
cd "D:\Antigravity projects\Smart  Retail Display System" && vercel --prod --yes 2>&1 | tail -8
```

Expected: `Aliased: https://signage.omnipushdigital.com`

- [ ] **Step 2: Force a reload on the Amlogic OMNI-106A (192.168.1.10)**

Connect adb and send a reload keystroke, or use the admin panel reload button in the WebView.

```bash
"$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe" connect 192.168.1.10:5555
"$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe" -s 192.168.1.10:5555 logcat -c
```

Wait 10 seconds for the app to reload, then:

```bash
"$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe" -s 192.168.1.10:5555 logcat -d 2>&1 | grep -iE "Cache|Phase|BG sync|Boot|Player" | head -40
```

- [ ] **Step 3: Verify stream-first behaviour in logcat**

Expected log sequence (first boot / cleared cache):

```
[Boot] Manifest attempt 1/3...
[Player] [MANIFEST_FETCH_START] ...
[Cache] BG sync done: X/X cached.          ← appears AFTER playing starts
[Playback] Advance: 0 -> 1                 ← content playing before BG sync finishes
```

**Must NOT see** a long gap between `MANIFEST_FETCH_START` and the first `Advance` log. On repeat boot the gap should be under 2 seconds.

- [ ] **Step 4: Verify on emulator**

```bash
"$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe" -s emulator-5554 logcat -c
"$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe" -s emulator-5554 logcat -d 2>&1 | grep -iE "Cache|UDB|BG sync|Boot|Player" | head -40
```

Same expected sequence. Also visually confirm the emulator screen shows content (not a black loading screen) while `↓ X/Y` appears in the bottom-right corner.

- [ ] **Step 5: Verify WiFi indicator still works**

Disconnect the test device from WiFi (or toggle airplane mode). The `<WifiOff>` icon must appear in the top-right corner immediately. Reconnect — it must disappear instantly (within 15 seconds per CLAUDE.md invariant #6).

---

## Self-Review

**Spec coverage:**
- ✅ First boot plays from HTTPS immediately (Phase 1 returns HTTPS, manifest applied, phase→playing)
- ✅ Repeat boot plays from blob: immediately (Phase 1 returns blob from IndexedDB)
- ✅ Offline boot plays from IndexedDB cache (existing path at line ~2001 unchanged)
- ✅ Silent HTTPS→blob: swap on next rotation (setManifest functional update + getItemData dep)
- ✅ No visual interruption (single batch update, not per-item)
- ✅ Videos excluded from both phases
- ✅ nativeAssetsRef set before sync (invariant preserved in Phase 1 setup)
- ✅ WiFi indicator not touched
- ✅ syncProgress indicator shown non-blocking (Task 3 overlay)

**Invariants check (CLAUDE.md):**
- ✅ #1 Videos never get blob: URLs — filter `a.type !== 'video' && !a.type.startsWith('video/')`
- ✅ #2 nativeAssetsRef set before sync — preserved verbatim from original code
- ✅ #5 file:// paths only in nativeAssetsRef — filter `!a.url.startsWith('file://')` in uncached list
- ✅ #6 WiFi indicator — `offline`/`setOffline` state not touched by this change
