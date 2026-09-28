import Visitor from '../models/Visitor.js';
import ExcludedIp from '../models/ExcludedIp.js';
import SiteStat from '../models/SiteStat.js';
import { responseHandler } from '../utils/responseHandler.js';

const PRIVATE_IP_RE = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|::1$|^$)/;

// Noise brands that appear in every Chromium-based UA-CH brands list
const BRAND_NOISE = new Set(['not_a brand', 'not a brand', 'not a(brand', 'chromium']);

// ── UA-string fallback parser ──────────────────────────────────────────────
function parseUA(ua = '') {
    const s = ua.toLowerCase();

    let deviceType = 'desktop';
    if (/tablet|ipad|playbook|silk|(android(?!.*mobile))/i.test(ua)) {
        deviceType = 'tablet';
    } else if (/mobile|android|iphone|ipod|blackberry|phone|windows phone/i.test(ua)) {
        deviceType = 'mobile';
    }

    // Android model (still useful for non-Chrome browsers and older UA strings)
    let deviceModel = '';
    if (/iphone/i.test(ua)) {
        deviceModel = 'iPhone';
    } else if (/ipad/i.test(ua)) {
        deviceModel = 'iPad';
    } else {
        const m = ua.match(/Android[^;]*;\s*([^)]+?)(?:\s+Build|\))/i);
        if (m) deviceModel = m[1].trim();
    }

    let os = 'unknown';
    if (/windows phone/i.test(s)) os = 'Windows Phone';
    else if (/win/i.test(s)) os = 'Windows';
    else if (/android/i.test(s)) os = 'Android';
    else if (/iphone|ipad|ipod/i.test(s)) os = 'iOS';
    else if (/mac/i.test(s)) os = 'macOS';
    else if (/linux/i.test(s)) os = 'Linux';

    let browser = 'unknown';
    if (/edg\//i.test(ua)) browser = 'Edge';
    else if (/opr\//i.test(ua) || /opera/i.test(ua)) browser = 'Opera';
    else if (/chrome\//i.test(ua) && !/chromium/i.test(ua)) browser = 'Chrome';
    else if (/safari\//i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
    else if (/firefox\//i.test(ua)) browser = 'Firefox';
    else if (/msie|trident/i.test(ua)) browser = 'IE';

    return { deviceType, deviceModel, os, browser };
}

// ── User-Agent Client Hints resolver ──────────────────────────────────────
// hints = { model, platform, platformVersion, brands: [{brand, version}], mobile }
function resolveFromHints(hints, uaParsed) {
    const result = {};

    // Device type: UACH `mobile` is reliable for phone vs. desktop; tablet
    // detection still falls back to UA (UACH has no tablet flag)
    if (hints.mobile !== undefined) {
        result.deviceType = hints.mobile ? 'mobile' : uaParsed.deviceType === 'tablet' ? 'tablet' : 'desktop';
    }

    // Device model: UACH gives the real model string (not "K")
    if (hints.model) {
        result.deviceModel = hints.model;  // e.g. "SM-S926B", "Pixel 8 Pro", "POCO X5 Pro"
    }

    // OS: platform + major version
    if (hints.platform) {
        const major = hints.platformVersion ? hints.platformVersion.split('.')[0] : '';
        result.os = major ? `${hints.platform} ${major}` : hints.platform;
    }

    // Browser: pick the most meaningful brand + include major version
    if (Array.isArray(hints.brands) && hints.brands.length) {
        // Priority order for browser display
        const PRIORITY = ['Brave', 'Microsoft Edge', 'Opera', 'Google Chrome', 'Firefox'];
        const real = hints.brands.filter(b => !BRAND_NOISE.has(b.brand.toLowerCase()));
        let chosen = null;
        for (const p of PRIORITY) {
            chosen = real.find(b => b.brand === p);
            if (chosen) break;
        }
        if (!chosen) chosen = real[0];
        if (chosen) {
            const major = chosen.version.split('.')[0];
            const shortName = chosen.brand
                .replace('Google Chrome', 'Chrome')
                .replace('Microsoft Edge', 'Edge');
            result.browser = major ? `${shortName} ${major}` : shortName;
        }
    }

    return result;
}

// ── IP Geolocation ─────────────────────────────────────────────────────────
async function getIpGeo(ip) {
    if (!ip || PRIVATE_IP_RE.test(ip)) return {};
    try {
        const res = await fetch(
            `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,city,isp`,
            { signal: AbortSignal.timeout(4000) }
        );
        const data = await res.json();
        if (data.status === 'success') {
            return {
                country: data.country || '',
                countryCode: data.countryCode || '',
                city: data.city || '',
                isp: data.isp || ''
            };
        }
    } catch { /* geo is best-effort */ }
    return {};
}

// ── Controller: track visitor ──────────────────────────────────────────────
// @route POST /api/public/visitors/count
export const getVisitorCount = async (req, res, next) => {
    try {
        const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
            || req.socket.remoteAddress
            || '';

        // Excluded addresses (the owner's own machines, office IPs, probes) are dropped
        // before anything is written: no row, no count. The visible total still comes
        // back so the footer keeps working for them.
        if (ip && (await ExcludedIp.exists({ ip }))) {
            const stat = await SiteStat.findOne({ identifier: 'main' }).lean();
            return responseHandler(res, 200, true, { count: stat ? stat.visitors : 0, excluded: true });
        }

        const ua = req.headers['user-agent'] || '';
        const hints = req.body || {};      // { model, platform, platformVersion, brands, mobile }

        let visitor = await Visitor.findOne({ ip });

        if (!visitor) {
            const uaParsed = parseUA(ua);
            const fromHints = resolveFromHints(hints, uaParsed);
            const geo = await getIpGeo(ip);

            await Visitor.create({
                ip,
                userAgent: ua,
                deviceType:  fromHints.deviceType  ?? uaParsed.deviceType,
                deviceModel: fromHints.deviceModel  ?? uaParsed.deviceModel,
                os:          fromHints.os           ?? uaParsed.os,
                browser:     fromHints.browser      ?? uaParsed.browser,
                ...geo
            });

            await SiteStat.findOneAndUpdate(
                { identifier: 'main' },
                { $inc: { visitors: 1 }, lastUpdated: new Date() },
                { new: true, upsert: true, setDefaultsOnInsert: true }
            );
        } else {
            visitor.lastVisit = new Date();
            visitor.visitCount += 1;

            // Refresh device info if UA or hints changed
            if (ua && visitor.userAgent !== ua) {
                const uaParsed = parseUA(ua);
                const fromHints = resolveFromHints(hints, uaParsed);
                visitor.userAgent   = ua;
                visitor.deviceType  = fromHints.deviceType  ?? uaParsed.deviceType;
                visitor.deviceModel = fromHints.deviceModel  ?? uaParsed.deviceModel;
                visitor.os          = fromHints.os           ?? uaParsed.os;
                visitor.browser     = fromHints.browser      ?? uaParsed.browser;
            } else if (hints.model && visitor.deviceModel !== hints.model) {
                // Same UA but UACH finally provided a real model (e.g. was "K" before)
                const uaParsed = parseUA(ua);
                const fromHints = resolveFromHints(hints, uaParsed);
                if (fromHints.deviceModel) visitor.deviceModel = fromHints.deviceModel;
                if (fromHints.os)          visitor.os          = fromHints.os;
                if (fromHints.browser)     visitor.browser     = fromHints.browser;
            }

            await visitor.save();
        }

        const stat = await SiteStat.findOne({ identifier: 'main' });
        return responseHandler(res, 200, true, { count: stat ? stat.visitors : 0 });
    } catch (error) {
        next(error);
    }
};

// ── Controller: admin visitor list ─────────────────────────────────────────
// @route GET /api/v2/admin/visitors
/** The address the admin is calling from, so "exclude my IP" needs no typing. */
export const getMyIp = async (req, res, next) => {
    try {
        const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';
        return responseHandler(res, 200, true, { ip });
    } catch (error) {
        next(error);
    }
};

export const getExcludedIps = async (req, res, next) => {
    try {
        const ips = await ExcludedIp.find().sort({ createdAt: -1 }).lean();
        return responseHandler(res, 200, true, { ips });
    } catch (error) {
        next(error);
    }
};

/**
 * Add an address to the exclusion list and remove whatever it has already recorded,
 * so the list retroactively cleans up as well as preventing future rows.
 */
export const addExcludedIp = async (req, res, next) => {
    try {
        const ip = String(req.body?.ip || '').trim();
        const note = String(req.body?.note || '').trim();
        if (!ip) return responseHandler(res, 400, false, null, 'An IP address is required.');

        const existing = await ExcludedIp.findOne({ ip });
        if (existing) return responseHandler(res, 409, false, null, 'That IP is already excluded.');

        const entry = await ExcludedIp.create({ ip, note, addedBy: req.admin?.email || '' });
        const removed = await Visitor.deleteOne({ ip });

        return responseHandler(
            res,
            201,
            true,
            { entry, removedVisitor: removed.deletedCount > 0 },
            removed.deletedCount ? 'Excluded, and the existing record was removed.' : 'Excluded.'
        );
    } catch (error) {
        next(error);
    }
};

export const removeExcludedIp = async (req, res, next) => {
    try {
        const deleted = await ExcludedIp.findByIdAndDelete(req.params.id);
        if (!deleted) return responseHandler(res, 404, false, null, 'Not found.');
        return responseHandler(res, 200, true, { ip: deleted.ip }, 'Removed from the exclusion list.');
    } catch (error) {
        next(error);
    }
};

/** Delete a single visitor row. The site-wide total is left alone — it is a running count. */
export const deleteVisitor = async (req, res, next) => {
    try {
        const deleted = await Visitor.findByIdAndDelete(req.params.id);
        if (!deleted) return responseHandler(res, 404, false, null, 'Visitor not found.');
        return responseHandler(res, 200, true, { ip: deleted.ip }, 'Visitor deleted.');
    } catch (error) {
        next(error);
    }
};

export const getAdminVisitors = async (req, res, next) => {
    try {
        const page  = Math.max(1, parseInt(req.query.page)  || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
        const skip  = (page - 1) * limit;

        const [visitors, total] = await Promise.all([
            Visitor.find().sort({ lastVisit: -1 }).skip(skip).limit(limit).lean(),
            Visitor.countDocuments()
        ]);

        return responseHandler(res, 200, true, { visitors, total, page, pages: Math.ceil(total / limit) });
    } catch (error) {
        next(error);
    }
};
