import Settings from '../models/Settings.js';

/**
 * Lightweight in-memory TTL cache for the global Settings document.
 *
 * The public IPO endpoints read `Settings` on every request to decide whether
 * to override the GMP source. That document changes rarely (only via the admin
 * settings update), so caching it for a short window removes a DB round-trip
 * from every public read. Call `invalidateSettingsCache()` after a write.
 */
const TTL_MS = 60 * 1000; // 60s

let cached = null;
let cachedAt = 0;

export async function getGlobalSettings() {
    const now = Date.now();
    if (cached && now - cachedAt < TTL_MS) {
        return cached;
    }
    cached = await Settings.findOne({ key: 'global' }).lean();
    cachedAt = now;
    return cached;
}

export function invalidateSettingsCache() {
    cached = null;
    cachedAt = 0;
}
