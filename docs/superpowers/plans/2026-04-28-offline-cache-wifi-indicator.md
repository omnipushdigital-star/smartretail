# Offline-First Media Cache + WiFi Indicator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pre-download all media to Android internal storage, play from local files on cold-boot offline, sync when CMS playlist changes via Supabase Realtime push, and show a persistent red WiFi-off icon while offline.

**Architecture:** A new `MediaCacheManager` class owns all download/storage/cleanup logic. The JS layer calls `AndroidHealth.syncAssetsFromManifest()` after every manifest fetch, and `getLocalAssetMap()` to resolve local `file://` paths before feeding assets into the playback engine. Supabase Realtime subscription lives in the JS layer (existing Supabase client); on change it calls `window.onCmsPlaylistChanged()` which triggers a manifest re-fetch. Android native layer shows the WiFi-off icon on `NetworkCallback.onLost()`.

**Tech Stack:** Kotlin Coroutines, OkHttp 4.12, SharedPreferences (manifest persistence), React/TypeScript, Supabase JS `postgres_changes`

**Frozen invariants — must not change:**
- Videos never get `blob:` URLs (existing guards in `cache.ts` and `syncAssets`)
- `nativeAssetsRef.current` set before `syncAssets` runs
- ExoPlayer `surface_type="texture_view"`
- WebView background BLACK by default, TRANSPARENT only during native video

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `app/src/main/res/drawable/ic_wifi_off.xml` | **CREATE** | WiFi-off vector drawable |
| `app/src/main/res/layout/activity_player.xml` | **MODIFY** | Replace ⚠ text with WiFi icon |
| `app/src/main/java/.../managers/MediaCacheManager.kt` | **CREATE** | Download, store, sync, cleanup |
| `app/src/main/java/.../managers/AndroidHealth.kt` | **MODIFY** | Add `getLocalAssetMap`, `syncAssetsFromManifest`, `onPlaylistChanged` |
| `app/src/main/java/.../activities/PlayerActivity.kt` | **MODIFY** | Init MediaCacheManager, fix offline indicator triggers |
| `omnipush-cms/src/pages/PlayerPage.tsx` | **MODIFY** | Merge local paths, skip `file://` in syncAssets, Realtime subscription |

---

## Task 1: WiFi-Off Vector Drawable

**Files:**
- Create: `app/src/main/res/drawable/ic_wifi_off.xml`

- [ ] **Step 1: Create the vector drawable**

```xml
<!-- app/src/main/res/drawable/ic_wifi_off.xml -->
<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">

    <!-- WiFi arcs (partially visible — slash covers them) -->
    <path
        android:strokeWidth="2"
        android:strokeColor="#EF4444"
        android:strokeLineCap="round"
        android:fillColor="@android:color/transparent"
        android:pathData="M5,12.55A11,11,0,0,1,19,12.55"/>
    <path
        android:strokeWidth="2"
        android:strokeColor="#EF4444"
        android:strokeLineCap="round"
        android:fillColor="@android:color/transparent"
        android:pathData="M1.42,9A16,16,0,0,1,22.58,9"/>
    <path
        android:strokeWidth="2"
        android:strokeColor="#EF4444"
        android:strokeLineCap="round"
        android:fillColor="@android:color/transparent"
        android:pathData="M8.53,16.11A6,6,0,0,1,15.47,16.11"/>

    <!-- Center dot -->
    <path
        android:strokeWidth="2"
        android:strokeColor="#EF4444"
        android:strokeLineCap="round"
        android:fillColor="@android:color/transparent"
        android:pathData="M12,20L12.01,20"/>

    <!-- Diagonal slash -->
    <path
        android:strokeWidth="2"
        android:strokeColor="#EF4444"
        android:strokeLineCap="round"
        android:fillColor="@android:color/transparent"
        android:pathData="M2,2L22,22"/>
</vector>
```

- [ ] **Step 2: Commit**

```bash
cd C:\Users\Naveen Saini\AndroidProjects\SmartRetailPlayer
git add app/src/main/res/drawable/ic_wifi_off.xml
git commit -m "feat: add wifi-off vector drawable for offline indicator"
```

---

## Task 2: Replace Offline Layout in activity_player.xml

**Files:**
- Modify: `app/src/main/res/layout/activity_player.xml:86-122`

- [ ] **Step 1: Replace offlineLayout content**

Find this block (lines ~86–122):
```xml
    <!-- Offline Indicator: Small ephemeral icon overlay (top-right), does NOT block content -->
    <LinearLayout
        android:id="@+id/offlineLayout"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:orientation="horizontal"
        android:gravity="center"
        android:background="#33000000"
        android:paddingHorizontal="12dp"
        android:paddingVertical="8dp"
        android:visibility="gone"
        android:alpha="0.75"
        app:layout_constraintTop_toTopOf="parent"
        app:layout_constraintEnd_toEndOf="parent"
        android:layout_marginTop="24dp"
        android:layout_marginEnd="24dp">

        <!-- WiFi-off unicode symbol as a compact icon -->
        <TextView
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:text="⚠"
            android:textColor="#EF4444"
            android:textSize="16sp" />

        <TextView
            android:id="@+id/tvOfflineStatus"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:layout_marginStart="6dp"
            android:text="Offline"
            android:textColor="#EF4444"
            android:textSize="11sp"
            android:textStyle="bold"
            android:letterSpacing="0.05"
            android:fontFamily="monospace" />

    </LinearLayout>
```

Replace with:
```xml
    <!--
        Offline indicator — semi-transparent red WiFi-off icon, top-right corner.
        Shown immediately on NetworkCallback.onLost(). Hidden on onAvailable().
        Persistent — no auto-hide timer. DO NOT add auto-hide back.
    -->
    <LinearLayout
        android:id="@+id/offlineLayout"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:orientation="horizontal"
        android:gravity="center"
        android:background="#99000000"
        android:paddingHorizontal="10dp"
        android:paddingVertical="8dp"
        android:visibility="gone"
        app:layout_constraintTop_toTopOf="parent"
        app:layout_constraintEnd_toEndOf="parent"
        android:layout_marginTop="16dp"
        android:layout_marginEnd="16dp">

        <ImageView
            android:layout_width="28dp"
            android:layout_height="28dp"
            android:src="@drawable/ic_wifi_off"
            android:contentDescription="Offline" />

    </LinearLayout>
```

Note: `tvOfflineStatus` binding reference is removed. Check PlayerActivity for `binding.tvOfflineStatus` references and remove them (Step 2).

- [ ] **Step 2: Remove tvOfflineStatus references in PlayerActivity.kt**

Search for `tvOfflineStatus` in `PlayerActivity.kt`:
```
grep -n "tvOfflineStatus" app/src/main/java/com/omnipush/smartretail/activities/PlayerActivity.kt
```

Delete the line `binding.tvOfflineStatus.text = "Offline"` (around line 176).

- [ ] **Step 3: Commit**

```bash
git add app/src/main/res/layout/activity_player.xml \
        app/src/main/java/com/omnipush/smartretail/activities/PlayerActivity.kt
git commit -m "feat: replace offline text indicator with persistent wifi-off icon"
```

---

## Task 3: Create MediaCacheManager

**Files:**
- Create: `app/src/main/java/com/omnipush/smartretail/managers/MediaCacheManager.kt`

- [ ] **Step 1: Create the file**

```kotlin
package com.omnipush.smartretail.managers

import android.content.Context
import android.util.Log
import kotlinx.coroutines.*
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

class MediaCacheManager(private val context: Context) {

    private val TAG = "MediaCacheManager"
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val prefs = context.getSharedPreferences("media_cache_v1", Context.MODE_PRIVATE)
    private val mediaDir = File(context.filesDir, "media").also { it.mkdirs() }
    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .build()

    // Thread-safe: media_id → "file:///absolute/path"
    @Volatile private var localAssetMap: Map<String, String> = emptyMap()

    init {
        loadSavedManifest()
    }

    // ── JS Bridge interface ───────────────────────────────────────────────────

    /** Returns JSON object: { "media_id": "file:///..." } for all confirmed local files. */
    fun getLocalAssetMapJson(): String = JSONObject(localAssetMap as Map<*, *>).toString()

    /**
     * Called from JS after every manifest fetch.
     * Downloads new/changed assets in background, swaps manifest, deletes old files.
     * Fire-and-forget — JS does not wait for completion.
     */
    fun syncAssetsFromManifest(assetsJson: String) {
        scope.launch {
            try {
                syncInternal(assetsJson)
            } catch (e: Exception) {
                Log.e(TAG, "Sync failed: ${e.message}", e)
            }
        }
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    private fun loadSavedManifest() {
        val json = prefs.getString("asset_manifest", null) ?: return
        try {
            val arr = JSONArray(json)
            val map = mutableMapOf<String, String>()
            for (i in 0 until arr.length()) {
                val obj = arr.getJSONObject(i)
                val mediaId = obj.getString("media_id")
                val localPath = obj.getString("local_path")
                if (File(localPath).exists()) {
                    map[mediaId] = "file://$localPath"
                }
            }
            localAssetMap = map
            Log.d(TAG, "Loaded ${map.size} cached assets from storage")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to load saved manifest: ${e.message}")
        }
    }

    private suspend fun syncInternal(assetsJson: String) = withContext(Dispatchers.IO) {
        val newAssets = JSONArray(assetsJson)
        val newMap = mutableMapOf<String, String>()
        val newManifestEntries = JSONArray()

        for (i in 0 until newAssets.length()) {
            val asset = newAssets.getJSONObject(i)
            val mediaId = asset.optString("media_id", "")
            val url = asset.optString("url", "")
            val checksum = asset.optString("checksum_sha256", "")
            val type = asset.optString("type", "bin")

            // Skip blobs, empty, and HTML (relative paths break in file://)
            if (mediaId.isEmpty() || url.isEmpty() || url.startsWith("blob:") || type == "html") continue

            val localFile = localFileFor(mediaId, checksum.ifEmpty { null }, type)

            if (!localFile.exists()) {
                Log.d(TAG, "Downloading $mediaId → ${localFile.name}")
                if (!downloadFile(url, localFile)) {
                    Log.w(TAG, "Download failed for $mediaId — will retry next sync")
                    continue
                }
            } else {
                Log.d(TAG, "Cache hit: $mediaId")
            }

            newMap[mediaId] = "file://${localFile.absolutePath}"
            newManifestEntries.put(JSONObject().apply {
                put("media_id", mediaId)
                put("local_path", localFile.absolutePath)
                put("checksum", checksum)
                put("type", type)
            })
        }

        // Atomic swap
        val oldMap = localAssetMap
        localAssetMap = newMap

        // Persist
        prefs.edit().putString("asset_manifest", newManifestEntries.toString()).apply()

        // Clean up files no longer in manifest — ONLY after new manifest is confirmed
        cleanupOldFiles(oldMap, newMap)

        Log.d(TAG, "✅ Sync complete — ${newMap.size} assets on disk")
    }

    private fun localFileFor(mediaId: String, checksum: String?, type: String): File {
        val ext = extensionFor(type)
        val safeName = if (!checksum.isNullOrEmpty()) "$checksum.$ext"
                       else "${mediaId.replace("-", "")}.$ext"
        return File(mediaDir, safeName)
    }

    private fun downloadFile(url: String, dest: File): Boolean {
        return try {
            val request = Request.Builder().url(url).build()
            val response = client.newCall(request).execute()
            if (!response.isSuccessful) {
                Log.e(TAG, "HTTP ${response.code} for $url")
                return false
            }
            val tmp = File(dest.parent, "${dest.name}.tmp")
            response.body?.byteStream()?.use { input ->
                tmp.outputStream().use { output -> input.copyTo(output) }
            }
            tmp.renameTo(dest)
            true
        } catch (e: Exception) {
            Log.e(TAG, "Download error: ${e.message}")
            false
        }
    }

    private fun cleanupOldFiles(oldMap: Map<String, String>, newMap: Map<String, String>) {
        val newPaths = newMap.values.map { it.removePrefix("file://") }.toSet()
        for ((_, oldPath) in oldMap) {
            val path = oldPath.removePrefix("file://")
            if (path !in newPaths) {
                val f = File(path)
                if (f.exists() && f.delete()) Log.d(TAG, "Deleted old asset: ${f.name}")
            }
        }
    }

    private fun extensionFor(type: String): String = when {
        type == "video" || type.startsWith("video/") -> "mp4"
        type.contains("png") -> "png"
        type.contains("gif") -> "gif"
        type == "html" -> "html"
        type.contains("pdf") -> "pdf"
        else -> "jpg"
    }

    fun release() {
        scope.cancel()
        Log.d(TAG, "Released")
    }
}
```

- [ ] **Step 2: Verify it compiles**

In Android Studio: Build → Make Project (Ctrl+F9). Expected: BUILD SUCCESSFUL with no errors in MediaCacheManager.kt.

- [ ] **Step 3: Commit**

```bash
git add app/src/main/java/com/omnipush/smartretail/managers/MediaCacheManager.kt
git commit -m "feat: add MediaCacheManager for offline-first asset caching"
```

---

## Task 4: Add JS Bridge Methods to AndroidHealth

**Files:**
- Modify: `app/src/main/java/com/omnipush/smartretail/managers/AndroidHealth.kt`

- [ ] **Step 1: Add mediaCacheManager constructor param**

Find the class declaration:
```kotlin
class AndroidHealth(
    private val context: android.content.Context,
    private val deviceInspector: DeviceInspector,
    private val kioskManager: KioskManager,
    private val prefManager: com.omnipush.smartretail.utils.PreferenceManager,
    private val playerView: androidx.media3.ui.PlayerView? = null
)
```

Replace with:
```kotlin
class AndroidHealth(
    private val context: android.content.Context,
    private val deviceInspector: DeviceInspector,
    private val kioskManager: KioskManager,
    private val prefManager: com.omnipush.smartretail.utils.PreferenceManager,
    private val playerView: androidx.media3.ui.PlayerView? = null,
    private val mediaCacheManager: MediaCacheManager? = null
)
```

- [ ] **Step 2: Add three new JS interface methods**

Add after the `reportError` method (before the `playNativeVideo` block):

```kotlin
// ── Offline-First Media Cache Bridge ─────────────────────────────────────

/**
 * Returns JSON map of { media_id: "file:///..." } for all locally cached assets.
 * Called by JS before feeding assets into the playback engine.
 * Returns "{}" if no cache is available (first boot).
 */
@JavascriptInterface
fun getLocalAssetMap(): String = mediaCacheManager?.getLocalAssetMapJson() ?: "{}"

/**
 * Called by JS after every manifest fetch with the raw assets JSON array.
 * Triggers background download of new/changed files.
 * Fire-and-forget — completes asynchronously.
 */
@JavascriptInterface
fun syncAssetsFromManifest(assetsJson: String) {
    mediaCacheManager?.syncAssetsFromManifest(assetsJson)
}

/**
 * Called by JS Supabase Realtime when the CMS playlist changes.
 * Notifies the player page to re-fetch the manifest immediately.
 */
@JavascriptInterface
fun onPlaylistChanged() {
    Log.d("AndroidHealth", "📡 CMS playlist change push received")
    mainHandler.post {
        (context as? com.omnipush.smartretail.activities.PlayerActivity)
            ?.binding?.webView
            ?.evaluateJavascript(
                "if(window.onCmsPlaylistChanged) window.onCmsPlaylistChanged();", null
            )
    }
}
```

- [ ] **Step 3: Build and verify**

Build → Make Project. Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/src/main/java/com/omnipush/smartretail/managers/AndroidHealth.kt
git commit -m "feat: add getLocalAssetMap, syncAssetsFromManifest, onPlaylistChanged to AndroidHealth"
```

---

## Task 5: Wire MediaCacheManager in PlayerActivity + Fix Offline Indicator

**Files:**
- Modify: `app/src/main/java/com/omnipush/smartretail/activities/PlayerActivity.kt`

- [ ] **Step 1: Add mediaCacheManager field and import**

After the existing field declarations (around line 42), add:
```kotlin
private lateinit var mediaCacheManager: com.omnipush.smartretail.managers.MediaCacheManager
```

Add import at top:
```kotlin
import com.omnipush.smartretail.managers.MediaCacheManager
```

- [ ] **Step 2: Initialize in onCreate before androidHealth**

In `onCreate`, before the `androidHealth = ...` block (around line 70), add:
```kotlin
mediaCacheManager = MediaCacheManager(this)
```

Then pass it to AndroidHealth — replace the existing AndroidHealth instantiation:
```kotlin
androidHealth = com.omnipush.smartretail.managers.AndroidHealth(
    this,
    deviceInspector,
    kioskManager,
    prefManager,
    binding.exoPlayerView,
    mediaCacheManager          // NEW
)
```

- [ ] **Step 3: Add onLost() to NetworkCallback — show indicator immediately on disconnect**

In `registerNetworkCallback()`, replace the `networkCallback` object:
```kotlin
networkCallback = object : android.net.ConnectivityManager.NetworkCallback() {
    override fun onAvailable(network: android.net.Network) {
        val now = System.currentTimeMillis()
        if (now - lastReloadTime < 600_000L) {
            Log.d(TAG, "Network restored but debounced (reloaded < 10m ago)")
            return
        }
        lastReloadTime = now
        Log.d(TAG, "Network restored — reloading with fresh content")
        runOnUiThread {
            binding.offlineLayout.visibility = View.GONE
            val url = prefManager.buildPlayerUrl(forceRefresh = true)
            webViewManager.loadPlayer(binding.webView, url, isOffline = false)
        }
    }

    override fun onLost(network: android.net.Network) {
        Log.w(TAG, "Network lost — showing offline indicator")
        runOnUiThread {
            binding.offlineLayout.visibility = View.VISIBLE
        }
        startOfflinePolling()
    }
}
```

- [ ] **Step 4: Remove auto-hide timer from onError handler**

In `setupWebView()`, find the `onError` lambda (around line 170–184):
```kotlin
onError = { errorMsg ->
    Log.e(TAG, "Player error: $errorMsg")
    runOnUiThread {
        binding.tvOfflineStatus.text = "Offline"     // DELETE THIS LINE
        binding.offlineLayout.visibility = View.VISIBLE
        binding.offlineLayout.alpha = 0.75f
        // Auto-hide after 10 seconds (ephemeral)      // DELETE
        adminHandler.postDelayed({                      // DELETE
            binding.offlineLayout.visibility = View.GONE  // DELETE
        }, 10_000)                                     // DELETE
        scheduleReload()
    }
}
```

Replace with:
```kotlin
onError = { errorMsg ->
    Log.e(TAG, "Player error: $errorMsg")
    runOnUiThread {
        // Show indicator — will hide when onAvailable() fires
        binding.offlineLayout.visibility = View.VISIBLE
        scheduleReload()
    }
}
```

- [ ] **Step 5: Release in onDestroy**

Find the `onDestroy` method and add:
```kotlin
mediaCacheManager.release()
```

- [ ] **Step 6: Build and verify**

Build → Make Project. Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add app/src/main/java/com/omnipush/smartretail/activities/PlayerActivity.kt
git commit -m "feat: wire MediaCacheManager, fix offline indicator to show on network loss"
```

---

## Task 6: PlayerPage.tsx — Local Path Merge + Realtime Subscription

**Files:**
- Modify: `omnipush-cms/src/pages/PlayerPage.tsx`

- [ ] **Step 1: Add fetchManifestRef for stable Realtime callback**

Find where `fetchManifest` useCallback is defined. Just after it, add:
```typescript
const fetchManifestRef = useRef(fetchManifest)
useEffect(() => { fetchManifestRef.current = fetchManifest }, [fetchManifest])
```

- [ ] **Step 2: Skip file:// URLs in syncAssets**

In `syncAssets`, find the inner loop body that calls `downloadAndCache`. It looks like:
```typescript
try {
    const blobUrl = await downloadAndCache({ ... })
```

Add a guard before this `try` block:
```typescript
// Skip assets already on local Android storage — file:// URLs can't be fetched
if (asset.url?.startsWith('file://')) return
```

- [ ] **Step 3: Integrate getLocalAssetMap + syncAssetsFromManifest in fetchManifest**

Find this block in `fetchManifest` (around line 1832–1845):
```typescript
let manifestToApply = data
if (data.assets && !isSyncingRef.current) {
    // Save original HTTP URLs before blob hydration — ExoPlayer needs these
    nativeAssetsRef.current = data.assets
    isSyncingRef.current = true
    try {
        const blobAssets = await syncAssets(data.assets)
        manifestToApply = { ...data, assets: blobAssets }
    } finally {
        isSyncingRef.current = false
    }
}
```

Replace with:
```typescript
let manifestToApply = data
if (data.assets && !isSyncingRef.current) {
    let assetsToUse = data.assets

    if (IS_ANDROID_NATIVE) {
        const ah = (window as any).AndroidHealth
        // Hand manifest to native cache manager — downloads new files in background
        if (ah?.syncAssetsFromManifest) {
            ah.syncAssetsFromManifest(JSON.stringify(data.assets))
        }
        // Resolve any already-downloaded assets to file:// paths
        if (ah?.getLocalAssetMap) {
            try {
                const localMap: Record<string, string> = JSON.parse(ah.getLocalAssetMap())
                if (Object.keys(localMap).length > 0) {
                    assetsToUse = data.assets.map((a: ManifestAsset) =>
                        localMap[a.media_id] ? { ...a, url: localMap[a.media_id] } : a
                    )
                    console.log('[Cache] Resolved', Object.keys(localMap).length, 'assets to local paths')
                }
            } catch (e) {
                console.warn('[Cache] getLocalAssetMap error:', e)
            }
        }
    }

    // Save resolved URLs before blob hydration — ExoPlayer uses these
    // file:// paths work identically to https:// for ExoPlayer
    nativeAssetsRef.current = assetsToUse
    isSyncingRef.current = true
    try {
        const blobAssets = await syncAssets(assetsToUse)
        manifestToApply = { ...data, assets: blobAssets }
    } finally {
        isSyncingRef.current = false
    }
}
```

- [ ] **Step 4: Add Supabase Realtime subscription useEffect**

Add this `useEffect` after the existing `nativeVideoActive` effect (the one that toggles `document.body.style.background`):

```typescript
// Supabase Realtime: re-fetch manifest when CMS playlist changes (push, not poll)
useEffect(() => {
    if (!IS_ANDROID_NATIVE || !manifest?.region_playlists) return

    const playlistItemIds = (
        Object.values(manifest.region_playlists) as Array<Array<{ playlist_item_id: string }>>
    )
        .flat()
        .map(item => item.playlist_item_id)
        .filter(Boolean)

    if (playlistItemIds.length === 0) return

    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null
    let fallbackTimer: ReturnType<typeof setInterval> | null = null

    const triggerSync = () => {
        console.log('[Realtime] CMS change pushed — re-fetching manifest')
        if (secretRef.current) fetchManifestRef.current(secretRef.current)
    }

    // Window hook for native AndroidHealth.onPlaylistChanged() call
    ;(window as any).onCmsPlaylistChanged = triggerSync

    const setupRealtime = async () => {
        try {
            const { data } = await supabase
                .from('playlist_items')
                .select('playlist_id')
                .eq('id', playlistItemIds[0])
                .maybeSingle()

            if (!data?.playlist_id) {
                console.warn('[Realtime] Could not resolve playlist_id — fallback poll only')
                return
            }

            realtimeChannel = supabase
                .channel(`omni-playlist-${data.playlist_id}`)
                .on(
                    'postgres_changes' as any,
                    { event: '*', schema: 'public', table: 'playlist_items',
                      filter: `playlist_id=eq.${data.playlist_id}` },
                    triggerSync
                )
                .subscribe()

            console.log(`[Realtime] ✅ Subscribed to playlist_items for ${data.playlist_id}`)
        } catch (e) {
            console.warn('[Realtime] Setup failed:', e)
        }
    }

    setupRealtime()

    // 30-min safety poll — covers WebSocket drop on Amlogic firmware
    fallbackTimer = setInterval(triggerSync, 30 * 60 * 1000)

    return () => {
        if (realtimeChannel) supabase.removeChannel(realtimeChannel)
        if (fallbackTimer) clearInterval(fallbackTimer)
        delete (window as any).onCmsPlaylistChanged
    }
    // Re-subscribe when the publication changes (new role/playlist assigned to device)
}, [manifest?.resolved?.pub_id])
```

- [ ] **Step 5: Build CMS and check for TypeScript errors**

```bash
cd "D:\Antigravity projects\Smart  Retail Display System\omnipush-cms"
npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors. If `maybeSingle` is not available on the supabase version, replace with `.limit(1).single()`.

- [ ] **Step 6: Commit and deploy**

```bash
cd "D:\Antigravity projects\Smart  Retail Display System"
git add omnipush-cms/src/pages/PlayerPage.tsx
git commit -m "feat: integrate local asset cache paths and Supabase Realtime playlist sync"
git push origin master
```

---

## Task 7: Build Android APK + End-to-End Verify

- [ ] **Step 1: Build release APK in Android Studio**

Build → Generate Signed Bundle/APK → APK → release

Expected output:
```
app/build/outputs/apk/release/SmartRetailPlayer-release-v1.1.156-186.apk
```

- [ ] **Step 2: Install on emulator and watch logs**

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb -s emulator-5554 install -r "C:\Users\Naveen Saini\AndroidProjects\SmartRetailPlayer\app\build\outputs\apk\release\SmartRetailPlayer-release-v1.1.156-186.apk"
& $adb -s emulator-5554 logcat -c
& $adb -s emulator-5554 shell monkey -p com.omnipush.smartretail 1
Start-Sleep 15
& $adb -s emulator-5554 logcat -d | Select-String "MediaCacheManager|AndroidHealth|Realtime|Cache"
```

Expected log lines:
```
D/MediaCacheManager: Loaded N cached assets from storage
D/MediaCacheManager: Downloading <media_id> → <checksum>.mp4
D/MediaCacheManager: ✅ Sync complete — N assets on disk
D/AndroidHealth: 📡 CMS playlist change push received   (when CMS changes something)
```

- [ ] **Step 3: Verify offline cold boot**

```powershell
# Disconnect emulator network
& $adb -s emulator-5554 shell svc wifi disable
& $adb -s emulator-5554 shell svc data disable
Start-Sleep 3

# Force stop and restart
& $adb -s emulator-5554 shell am force-stop com.omnipush.smartretail
& $adb -s emulator-5554 logcat -c
Start-Sleep 1
& $adb -s emulator-5554 shell monkey -p com.omnipush.smartretail 1
Start-Sleep 12

& $adb -s emulator-5554 logcat -d | Select-String "MediaCacheManager|file://"
```

Expected:
```
D/MediaCacheManager: Loaded N cached assets from storage
[Cache] Resolved N assets to local paths
D/AndroidHealth: 🎬 Play -> file:///data/user/0/com.omnipush.smartretail/files/media/<file>.mp4
```

Take screenshot to confirm content playing:
```powershell
& $adb -s emulator-5554 shell screencap -p /sdcard/offline_test.png
& $adb -s emulator-5554 pull /sdcard/offline_test.png "$env:TEMP\offline_test.png"
```

- [ ] **Step 4: Verify offline WiFi indicator**

With network still off from Step 3, take screenshot — confirm red WiFi-off icon in top-right corner.

Restore network:
```powershell
& $adb -s emulator-5554 shell svc wifi enable
Start-Sleep 5
& $adb -s emulator-5554 shell screencap -p /sdcard/online_test.png
& $adb -s emulator-5554 pull /sdcard/online_test.png "$env:TEMP\online_test.png"
```

Expected: WiFi icon gone, content continues playing.

- [ ] **Step 5: Final commit**

```bash
cd C:\Users\Naveen Saini\AndroidProjects\SmartRetailPlayer
git add .
git commit -m "feat: offline-first media cache with CMS Realtime push and WiFi indicator"
git push origin master
```
