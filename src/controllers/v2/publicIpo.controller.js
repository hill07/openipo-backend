import IpoFull from '../../models/IpoFull.js';
import { responseHandler } from '../../utils/responseHandler.js';

// @desc    Get Public IPOs
// @route   GET /api/v2/ipos
// @access  Public
export const getIpos = async (req, res, next) => {
    try {
        const { page = 1, limit = 20, type, status, search } = req.query;

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
            .select('companyName slug symbol dates status type priceBand gmp.current subscription.subscriptionTimes logo allotment') // optimization
            .sort({ 'dates.open': -1 }) // Show newest first? Or upcoming?
            .limit(Number(limit))
            .skip((Number(page) - 1) * Number(limit));

        return responseHandler(res, 200, true, { ipos, count, pages: Math.ceil(count / limit) });
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

        return responseHandler(res, 200, true, ipo);
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
        const ipo = await IpoFull.findOne({ slug, isPublished: true, isDeleted: false }).select('note');

        if (!ipo || !ipo.note || !ipo.note.isActive) {
            // Return null or empty if no active note
            return responseHandler(res, 200, true, null);
        }

        return responseHandler(res, 200, true, ipo.note);
    } catch (error) {
        next(error);
    }
};
