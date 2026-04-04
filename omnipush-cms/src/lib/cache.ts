
const DB_NAME = 'omnipush_cache'
const STORE_NAME = 'assets'
const DB_VERSION = 1

export interface CachedAsset {
    media_id: string
    blob: Blob
    type: string
    checksum: string | null
    saved_at: number
}

export const cacheDb = {
    db: null as IDBDatabase | null,

    async init() {
        if (this.db) return this.db
        return new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION)
            request.onerror = () => reject(request.error)
            request.onsuccess = () => {
                this.db = request.result
                resolve(request.result)
            }
            request.onupgradeneeded = (e) => {
                const db = request.result
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'media_id' })
                }
            }
        })
    },

    async get(media_id: string): Promise<CachedAsset | null> {
        const db = await this.init()
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly')
            const store = transaction.objectStore(STORE_NAME)
            const request = store.get(media_id)
            request.onsuccess = () => resolve(request.result || null)
            request.onerror = () => reject(request.error)
        })
    },

    async save(asset: CachedAsset): Promise<void> {
        const db = await this.init()
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite')
            const store = transaction.objectStore(STORE_NAME)
            const request = store.put(asset)
            request.onsuccess = () => resolve()
            request.onerror = () => reject(request.error)
        })
    },

    async delete(media_id: string): Promise<void> {
        const db = await this.init()
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite')
            const store = transaction.objectStore(STORE_NAME)
            const request = store.delete(media_id)
            request.onsuccess = () => resolve()
            request.onerror = () => reject(request.error)
        })
    },

    async clear(): Promise<void> {
        const db = await this.init()
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite')
            const store = transaction.objectStore(STORE_NAME)
            const request = store.clear()
            request.onsuccess = () => resolve()
            request.onerror = () => reject(request.error)
        })
    }
}

export async function downloadAndCache(asset: { media_id: string; url: string; checksum_sha256?: string | null; type: string }): Promise<string> {
    try {
        const cached = await cacheDb.get(asset.media_id)

        // If we have it and checksum matches (TODO: implement checksum check)
        if (cached && cached.blob && cached.blob.size > 0) {
            console.log(`[Cache] Hit: ${asset.media_id} (${(cached.blob.size / 1024 / 1024).toFixed(2)} MB)`)
            return URL.createObjectURL(cached.blob)
        }
    } catch (e: any) {
        console.warn(`[Cache] Read error for ${asset.media_id}: ${e.message}`)
    }

    console.log(`[Cache] Downloading: ${asset.url}`)
    try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 60000) // 1 min sync timeout

        const res = await fetch(asset.url, { signal: controller.signal })
        clearTimeout(timeoutId)

        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
        const blob = await res.blob()

        if (!blob || blob.size === 0) throw new Error("Received empty blob")

        await cacheDb.save({
            media_id: asset.media_id,
            blob,
            type: asset.type,
            checksum: asset.checksum_sha256 || null,
            saved_at: Date.now()
        })

        return URL.createObjectURL(blob)
    } catch (err: any) {
        if (err.name === 'AbortError') {
            throw new Error(`Download timed out after 60s`)
        }
        // Check for specific CORS/Network indicators on old WebViews
        const isNetworkError = !err.message || err.message === 'Failed to fetch' || err.name === 'TypeError'
        const reason = isNetworkError ? 'Network/CORS blocked' : err.message
        throw new Error(reason)
    }
}

/**
 * Returns a blob:// URL for a cached asset (read-only, no download).
 * Returns null if the asset is not in IndexedDB cache.
 */
export async function getCachedBlobUrl(media_id: string): Promise<string | null> {
    try {
        const cached = await cacheDb.get(media_id)
        if (!cached) return null
        return URL.createObjectURL(cached.blob)
    } catch {
        return null
    }
}

/**
 * Batch-hydrate an asset list with blob URLs from IndexedDB.
 * For any asset that is already cached locally, replaces the remote URL
 * with a blob:// URL so playback works fully offline.
 * Safe to call at any time — silently skips any cache misses.
 */
export async function hydrateAssetsFromCache(
    assets: Array<{ media_id: string; url: string | null; type: string; checksum_sha256: string | null; bytes: number | null }>
): Promise<Array<{ media_id: string; url: string | null; type: string; checksum_sha256: string | null; bytes: number | null }>> {
    return Promise.all(
        assets.map(async (asset) => {
            if (!asset.media_id || !asset.url) return asset

            // Android WebView MediaPlayer cannot play `blob:` URIs.
            // We skip blob hydration for video elements and rely on native caching
            // or the original URL so the native MediaPlayer doesn't throw a format error.
            if ((asset.type || '').includes('video')) {
                return asset
            }

            const blobUrl = await getCachedBlobUrl(asset.media_id)
            if (blobUrl) {
                console.log(`[Cache] Offline hydrate ✅ ${asset.media_id}`)
                return { ...asset, url: blobUrl }
            }
            return asset
        })
    )
}

