import IpoFull from '../../models/IpoFull.js';
import ipoFullSchema from '../../validators/ipoFull.zod.js';
import { slugify } from '../../utils/slugify.js';
import { responseHandler } from '../../utils/responseHandler.js';
import { logAdminAction } from '../../utils/auditLogger.js';
import { computeDerivedFields } from '../../utils/ipoCalculations.js';

// @desc    Create new IPO
// @route   POST /api/v2/admin/ipos
// @access  Private (Admin)
export const createIpo = async (req, res, next) => {
    try {
        // 1. Zod Validation
        const validatedData = ipoFullSchema.parse(req.body);

        // 1b. Auto-generate IPO ID if not provided
        if (!validatedData.ipoId) {
            const lastIpo = await IpoFull.findOne().sort({ ipoId: -1 });
            validatedData.ipoId = (lastIpo?.ipoId || 0) + 1;
        }

        // 2. Slugify (Run on provided slug OR company name to ensure validity)
        let rawSlug = validatedData.slug || validatedData.companyName;
        let slug = slugify(rawSlug);

        // Ensure slug is unique
        let slugExists = await IpoFull.findOne({ slug });
        if (slugExists) {
            slug = `${slug}-${Date.now()}`;
        }
        validatedData.slug = slug;

        // 3. Compute Derived Fields
        computeDerivedFields(validatedData);

        // 4. Set meta
        validatedData.updatedBy = req.admin._id;
        validatedData.updatedByEmail = req.admin.email;

        // 5. Create
        const ipo = await IpoFull.create(validatedData);

        // 6. Audit Log
        await logAdminAction(req.admin._id, 'CREATE_IPO', req, { ipoId: ipo.ipoId, company: ipo.companyName });

        return responseHandler(res, 201, true, ipo, 'IPO Created Successfully');
    } catch (error) {
        if (error.name === 'ZodError') {
            return res.status(400).json({ success: false, message: 'Validation Error', errors: error.errors });
        }
        next(error);
    }
};

// @desc    Get All IPOs (Admin)
// @route   GET /api/v2/admin/ipos
// @query   page, limit, search, status, type, showDeleted
// @access  Private
export const getAdminIpos = async (req, res, next) => {
    try {
        const { page = 1, limit = 10, search, status, type, showDeleted } = req.query;

        const query = {};

        // Search
        if (search) {
            query.$text = { $search: search };
        }

        // Filter
        if (status) query.status = status;
        if (type) query.type = type;

        // Soft Delete Handling
        if (showDeleted === 'true') {
            // show all or specific logic? usually admins want to see active by default
            // If showDeleted is true, we might show ONLY deleted or ALL? 
            // Let's assume inclusive or separate filter. 
            // Standard: default show isDeleted: false.
        } else {
            query.isDeleted = false;
        }

        const count = await IpoFull.countDocuments(query);
        const ipos = await IpoFull.find(query)
            .sort({ createdAt: -1 })
            .limit(Number(limit))
            .skip((Number(page) - 1) * Number(limit));

        return responseHandler(res, 200, true, { ipos, count, pages: Math.ceil(count / limit) });
    } catch (error) {
        next(error);
    }
};

// @desc    Get Single IPO by Slug (Admin)
// @route   GET /api/v2/admin/ipos/:slug
// @access  Private
export const getAdminIpoBySlug = async (req, res, next) => {
    try {
        const ipo = await IpoFull.findOne({ slug: req.params.slug });
        if (!ipo) {
            return responseHandler(res, 404, false, null, 'IPO not found');
        }
        return responseHandler(res, 200, true, ipo);
    } catch (error) {
        next(error);
    }
};

// @desc    Update IPO
// @route   PUT /api/v2/admin/ipos/:slug
// @access  Private
export const updateIpo = async (req, res, next) => {
    try {
        const { slug } = req.params;
        let ipo = await IpoFull.findOne({ slug });

        if (!ipo) {
            return responseHandler(res, 404, false, null, 'IPO not found');
        }

        const validatedUpdates = ipoFullSchema.partial().parse(req.body);

        // Compute Derived Fields (Merge with existing data to ensure dependency availability)
        const mergedDoc = { ...ipo.toObject(), ...validatedUpdates };
        computeDerivedFields(mergedDoc);

        // Apply derived fields back to updates
        validatedUpdates.status = mergedDoc.status;
        validatedUpdates.minInvestment = mergedDoc.minInvestment;
        if (mergedDoc.gmp) validatedUpdates.gmp = mergedDoc.gmp;
        if (mergedDoc.reservations) validatedUpdates.reservations = mergedDoc.reservations;
        if (mergedDoc.subscription) validatedUpdates.subscription = mergedDoc.subscription;

        // Update meta
        validatedUpdates.updatedBy = req.admin._id;
        validatedUpdates.updatedByEmail = req.admin.email;

        // Do Update
        const updatedIpo = await IpoFull.findOneAndUpdate(
            { slug },
            { $set: validatedUpdates },
            { new: true, runValidators: true }
        );

        await logAdminAction(req.admin._id, 'UPDATE_IPO', req, { slug, company: updatedIpo.companyName });

        return responseHandler(res, 200, true, updatedIpo, 'IPO Updated Successfully');
    } catch (error) {
        console.error("Update IPO Error:", error);
        if (error.name === 'ZodError') {
            console.error("Zod Validation Errors:", JSON.stringify(error.errors, null, 2));
            return res.status(400).json({ success: false, message: 'Validation Error', errors: error.errors });
        }
        next(error);
    }
};

// @desc    Soft Delete IPO
// @route   DELETE /api/v2/admin/ipos/:slug
// @access  Private
export const deleteIpo = async (req, res, next) => {
    try {
        const { slug } = req.params;
        const ipo = await IpoFull.findOne({ slug });

        if (!ipo) return responseHandler(res, 404, false, null, 'IPO not found');

        ipo.isDeleted = true;
        ipo.deletedAt = new Date();
        ipo.updatedBy = req.admin._id;
        await ipo.save();

        await logAdminAction(req.admin._id, 'DELETE_IPO', req, { slug });

        return responseHandler(res, 200, true, null, 'IPO Soft Deleted');
    } catch (error) {
        next(error);
    }
};
