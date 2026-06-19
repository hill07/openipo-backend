import Visitor from '../models/Visitor.js';
import SiteStat from '../models/SiteStat.js';
import { responseHandler } from '../utils/responseHandler.js';

function parseUA(ua = '') {
    const s = ua.toLowerCase();

    let deviceType = 'desktop';
    if (/tablet|ipad|playbook|silk|(android(?!.*mobile))/i.test(ua)) {
        deviceType = 'tablet';
    } else if (/mobile|android|iphone|ipod|blackberry|phone|windows phone/i.test(ua)) {
        deviceType = 'mobile';
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

    return { deviceType, os, browser };
}

// @desc    Increment and Get Visitor Count
// @route   GET /api/public/visitors/count
export const getVisitorCount = async (req, res, next) => {
    try {
        const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
        const ua = req.headers['user-agent'] || '';

        let visitor = await Visitor.findOne({ ip });

        if (!visitor) {
            const { deviceType, os, browser } = parseUA(ua);
            await Visitor.create({ ip, userAgent: ua, deviceType, os, browser });

            await SiteStat.findOneAndUpdate(
                { identifier: 'main' },
                { $inc: { visitors: 1 }, lastUpdated: new Date() },
                { new: true, upsert: true, setDefaultsOnInsert: true }
            );
        } else {
            visitor.lastVisit = new Date();
            visitor.visitCount += 1;
            // Update UA info if it changed (e.g. user switched device)
            if (ua && visitor.userAgent !== ua) {
                const { deviceType, os, browser } = parseUA(ua);
                visitor.userAgent = ua;
                visitor.deviceType = deviceType;
                visitor.os = os;
                visitor.browser = browser;
            }
            await visitor.save();
        }

        const stat = await SiteStat.findOne({ identifier: 'main' });
        return responseHandler(res, 200, true, { count: stat ? stat.visitors : 0 });
    } catch (error) {
        next(error);
    }
};

// @desc    Get all visitors (admin)
// @route   GET /api/v2/admin/visitors
export const getAdminVisitors = async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
        const skip = (page - 1) * limit;

        const [visitors, total] = await Promise.all([
            Visitor.find()
                .sort({ lastVisit: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Visitor.countDocuments()
        ]);

        return responseHandler(res, 200, true, {
            visitors,
            total,
            page,
            pages: Math.ceil(total / limit)
        });
    } catch (error) {
        next(error);
    }
};
