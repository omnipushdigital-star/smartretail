# Android Box Player Architecture & Settings Reference (v1.1.2+)

This document serves as the "Golden Build" reference for configuring the Android Player App (`SmartRetailPlayer`) and the React Player Engine (`omnipush-cms`) to ensure smooth, hardware-accelerated video playback and a seamless kiosk experience on Amlogic S905W2 TV boxes (and similar Android 11 devices).

## 1. WebView Configuration (`WebViewManager.kt`)
To guarantee smooth video decoding without stuttering or black screens, the WebView must strictly enforce **Hardware Acceleration**, a black background to mask slot-switching, and correct focus definitions.

```kotlin
// In WebViewManager.kt -> configure()

// 1. Force black background to mask any white flashes between DOM updates
webView.setBackgroundColor(android.graphics.Color.BLACK)

// 2. ENABLE HARDWARE ACCELERATION 
// (Crucial for video decoding on Android 11+ TV Boxes)
webView.setLayerType(View.LAYER_TYPE_HARDWARE, null)

// 3. Ensure Focus is granted for interaction simulations
webView.isFocusable = true
webView.isFocusableInTouchMode = true
webView.requestFocus()

// 4. Media Options
webView.settings.mediaPlaybackRequiresUserGesture = false // Attempt to disable autoplay restrictions
```

## 2. Unlocking Media Engine (`PlayerActivity.kt`)
Even with `mediaPlaybackRequiresUserGesture = false`, modern Android WebViews frequently deny media autoplay privileges unless an explicit physical screen tap occurs. To bypass this, we mathematically simulate multiple tap interactions immediately after the player URL loads.

```kotlin
// In PlayerActivity.kt -> setupWebView()

webViewManager.configure(
    onPageLoaded = {
        runOnUiThread {
            binding.loadingLayout.visibility = View.GONE
            binding.webView.visibility = View.VISIBLE
            // Trigger immediately when DOM paints
            simulateInteraction() 
        }
    }
)

private fun simulateInteraction() {
    lifecycleScope.launch {
        // Send a burst of 3 taps over the first 2.5 seconds
        // This ensures the WebView registers the page as 'interactive'
        repeat(3) { i ->
            delay(i * 1000L + 500L) // Fire at 0.5s, 1.5s, and 2.5s
            val now = SystemClock.uptimeMillis()
            val downEvent = MotionEvent.obtain(now, now, MotionEvent.ACTION_DOWN, 50f, 50f, 0)
            val upEvent = MotionEvent.obtain(now, now, MotionEvent.ACTION_UP, 50f, 50f, 0)
            
            try {
                binding.webView.dispatchTouchEvent(downEvent)
                binding.webView.dispatchTouchEvent(upEvent)
                Log.d(TAG, "Media unlock interaction #$i sent")
            } finally {
                downEvent.recycle()
                upEvent.recycle()
            }
        }
    }
}
```

## 3. Suppressing Native UI Overlays (`PlayerPage.tsx`)
When Hardware Acceleration is enabled, the Android WebView's media decoder often flashes a giant "Play" icon right as a new `<video>` element mounts. We suppress this by forcing an invisible 1x1 transparent Base-64 GIF onto the `poster` attribute of the HTML `<video>` element.

```tsx
// In PlayerPage.tsx -> renderMain()

// A 1x1 completely transparent Base64 image
const transparentBase64 = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

<video
    src={offlineUri}
    autoPlay
    muted
    playsInline
    // Hide the native Android UI "Play Button" flash by locking the poster
    poster={transparentBase64} 
    onEnded={() => {
        console.log('[Player] Video cleanly ended. Advancing.');
        // Advance logic...
    }}
    onError={(e) => {
        console.error('[Player] Video element error:', e);
        // Fallback advance logic...
    }}
    style={{
        width: '100%',
        height: '100%',
        objectFit: 'contain', 
        backgroundColor: '#000'
    }}
/>
```

## 4. Fallback Anti-Hang Logic (`PlayerPage.tsx`)
If a video freezes, fails to decode, or the WebView swallows the `onEnded` event (common on low-end TV boxes), the player could hang indefinitely on the video frame. A safety duration boundary is required.

```typescript
// In PlayerPage.tsx

// Global safety boundary
const DEFAULT_VIDEO_DURATION = 300 // 5 minutes

useEffect(() => {
    // ...
    let timeoutMs = 10000; // 10s default
    
    if (currentItem.asset_type === 'video') {
       // If video fails to notify onEnded after 5 minutes, force it forward anyway.
       timeoutMs = DEFAULT_VIDEO_DURATION * 1000; 
    } else if (currentItem.duration) {
       timeoutMs = currentItem.duration * 1000;
    }
    
    timer = window.setTimeout(advance, timeoutMs);
    // ...
}, [currentItem])
```

## 5. Device Health Telemetry Bridge (`PlayerPage.tsx` -> `AndroidHealth`)
The React Frontend must actively pull diagnostic metrics (RAM, Model, WebView version, Storage Quotas) from the Native layer via an injected JS Interface (`AndroidHealth`) or the browser API.

```javascript
// Telemetry check before sending `device-heartbeat` edge function:
if (window.AndroidHealth) {
    if (window.AndroidHealth.getRamTotal) meta.ram_total_mb = Number(window.AndroidHealth.getRamTotal())
    if (window.AndroidHealth.getModel) meta.device_model = String(window.AndroidHealth.getModel())
    // etc.
}

// Add browser-level storage quota checks for offline asset diagnostic
if (navigator.storage && navigator.storage.estimate) {
    const est = await navigator.storage.estimate()
    meta.storage_total_gb = parseFloat((est.quota / 1073741824).toFixed(2))
    meta.storage_free_gb = parseFloat(((est.quota - est.usage) / 1073741824).toFixed(2))
}
```

These settings strictly dictate the core stability loop of the Smart Retail Player. Changing `Hardware Acceleration` boundaries or removing the `poster` hack will immediately result in visual tearing or UI overlays.
