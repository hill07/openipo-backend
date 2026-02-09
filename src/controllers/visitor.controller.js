import Visitor from '../models/Visitor.js';
import SiteStat from '../models/SiteStat.js';
import { responseHandler } from '../utils/responseHandler.js';

// @desc    Increment and Get Visitor Count
// @route   GET /api/public/visitors/count
export const getVisitorCount = async (req, res, next) => {
    try {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        // Check if IP exists
        let visitor = await Visitor.findOne({ ip });

        if (!visitor) {
            // New Visitor -> Create Entry & Increment SiteStat
            await Visitor.create({ ip });

            await SiteStat.findOneAndUpdate(
                { identifier: 'main' },
                { $inc: { visitors: 1 }, lastUpdated: new Date() },
                { new: true, upsert: true, setDefaultsOnInsert: true }
            );
        } else {
            // Returning Visitor -> Just update last visit
            visitor.lastVisit = new Date();
            visitor.visitCount += 1;
            await visitor.save();
        }

        // Get Current Count
        const stat = await SiteStat.findOne({ identifier: 'main' });

        return responseHandler(res, 200, true, { count: stat ? stat.visitors : 0 });
    } catch (error) {
        next(error);
    }
};
