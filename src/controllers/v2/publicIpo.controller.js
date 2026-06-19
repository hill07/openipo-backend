import IpoFull from '../../models/IpoFull.js';
import { responseHandler } from '../../utils/responseHandler.js';
import { getGlobalSettings } from '../../utils/settingsCache.js';

// @desc    Get Public IPOs
// @route   GET /api/v2/ipos
// @access  Public
export const getIpos = async (req, res, next) => {
    try {
        const { type, status, search } = req.query;
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
        const page = Math.max(1, Number(req.query.page) || 1);

        const query = {
            isPublished: true,
            isDeleted: false
        };

        if (type) query.type = type;
        if (status) {
            const statusArray = status.split(",").map(s => s.trim().toUpperCase());
            query.status = { $in: statusArray };
        }
        if (search) {
            query.$text = { $search: search };
        }

        const count = await IpoFull.countDocuments(query);
        const ipos = await IpoFull.find(query)
            .select('companyName slug symbol dates status type priceBand gmp.current gmp.source gmp.sourceLink subscription.subscriptionTimes logo allotment') // optimization
            .sort({ 'dates.open': -1 }) // Show newest first? Or upcoming?
            .limit(limit)
            .skip((page - 1) * limit)
            .lean({ virtuals: true });

        const settings = await getGlobalSettings();
        const iposData = ipos.map(ipoObj => {
            if (!ipoObj.gmp) ipoObj.gmp = {};
            
            // If showIpoGuru (Default GMP Source toggle) is ON, override with global settings
            if (settings?.showIpoGuru) {
                if (settings.gmpSource) {
                    ipoObj.gmp.source = settings.gmpSource;
                    ipoObj.gmp.sourceLink = settings.gmpSourceLink;
                }
            }
            return ipoObj;
        });

        return responseHandler(res, 200, true, { ipos: iposData, count, pages: Math.ceil(count / limit) });
    } catch (error) {
        next(error);
    }
};

// @desc    Get Single IPO (Full Details)
// @route   GET /api/v2/ipos/:idOrSlug
// @access  Public
export const getIpo = async (req, res, next) => {
    try {
        const { slug: idOrSlug } = req.params; // Next.js/Express might route this as :slug

        let query = {};
        const isNumeric = /^\d+$/.test(idOrSlug);

        if (isNumeric) {
            query = { ipoId: parseInt(idOrSlug), isPublished: true, isDeleted: false };
        } else {
            query = { slug: idOrSlug, isPublished: true, isDeleted: false };
        }

        const ipo = await IpoFull.findOne(query);

        if (!ipo) {
            return responseHandler(res, 404, false, null, 'IPO not found');
        }

        const settings = await getGlobalSettings();

        const ipoObj = ipo.toObject({ virtuals: true });
        if (!ipoObj.gmp) ipoObj.gmp = {};

        // If showIpoGuru (Default GMP Source toggle) is ON, override with global settings
        if (settings?.showIpoGuru) {
            if (settings.gmpSource) {
                ipoObj.gmp.source = settings.gmpSource;
                ipoObj.gmp.sourceLink = settings.gmpSourceLink;
            }
        }

        return responseHandler(res, 200, true, ipoObj);
    } catch (error) {
        next(error);
    }
};

// @desc    Get IPO Note
// @route   GET /api/v2/ipos/:slug/note
// @access  Public
export const getIpoNote = async (req, res, next) => {
    try {
        const { slug } = req.params;
        const ipo = await IpoFull.findOne({ slug, isPublished: true, isDeleted: false }).select('note').lean();

        if (!ipo || !ipo.note || !ipo.note.isActive) {
            // Return null or empty if no active note
            return responseHandler(res, 200, true, null);
        }

        return responseHandler(res, 200, true, ipo.note);
    } catch (error) {
        next(error);
    }
};
