import SiteStat from '../models/SiteStat.js';
import { responseHandler } from '../utils/responseHandler.js';

// @desc    Increment and Get Visitor Count
// @route   GET /api/public/visitors/count
export const getVisitorCount = async (req, res, next) => {
    try {
        // Find and increment atomically
        let stat = await SiteStat.findOneAndUpdate(
            { identifier: 'main' },
            { $inc: { visitors: 1 }, lastUpdated: new Date() },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        return responseHandler(res, 200, true, { count: stat.visitors });
    } catch (error) {
        next(error);
    }
};
