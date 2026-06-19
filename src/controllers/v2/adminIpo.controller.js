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
            const exactMsg = error.errors.map(e => e.message || e.msg || e).join(', ');
            return res.status(400).json({ success: false, message: exactMsg, errors: error.errors });
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
        const { search, status, type, showDeleted } = req.query;
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));
        const page = Math.max(1, Number(req.query.page) || 1);

        const query = {};

        // Search
        if (search) {
            query.$text = { $search: search };
        }

        // Filter
        if (status) query.status = status;
        if (type) query.type = type;

        // Soft Delete Handling: default to active only. When showDeleted=true,
        // include archived IPOs by leaving the isDeleted filter off.
        if (showDeleted !== 'true') {
            query.isDeleted = false;
        }

        const count = await IpoFull.countDocuments(query);
        const ipos = await IpoFull.find(query)
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip((page - 1) * limit)
            .lean();

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

        // 1. Zod Validation (Partial for updates)
        const validatedUpdates = ipoFullSchema.partial().parse(req.body);

        // 2. Prepare data for derived calculations
        // We use a plain object for calculations to avoid Mongoose-specific issues
        const currentData = ipo.toObject();
        const mergedData = { 
            ...currentData, 
            ...validatedUpdates,
            // Ensure nested objects are also merged correctly if they exist in updates
            gmp: validatedUpdates.gmp ? { ...currentData.gmp, ...validatedUpdates.gmp } : currentData.gmp,
            subscription: validatedUpdates.subscription ? { ...currentData.subscription, ...validatedUpdates.subscription } : currentData.subscription,
            dates: validatedUpdates.dates ? { ...currentData.dates, ...validatedUpdates.dates } : currentData.dates
        };

        // 3. Compute Derived Fields on the merged data
        computeDerivedFields(mergedData);

        // 4. Update the validatedUpdates with calculated values
        validatedUpdates.status = mergedData.status;
        validatedUpdates.minInvestment = mergedData.minInvestment;
        
        // Only update nested objects if they were affected or intended to be updated
        if (mergedData.gmp) validatedUpdates.gmp = mergedData.gmp;
        if (mergedData.subscription) validatedUpdates.subscription = mergedData.subscription;
        if (mergedData.reservations) validatedUpdates.reservations = mergedData.reservations;

        // 5. Update meta
        validatedUpdates.updatedBy = req.admin?._id;
        validatedUpdates.updatedByEmail = req.admin?.email;

        // 6. Perform the Update
        const updatedIpo = await IpoFull.findOneAndUpdate(
            { slug },
            { $set: validatedUpdates },
            { new: true, runValidators: true }
        );

        if (!updatedIpo) {
             return responseHandler(res, 404, false, null, 'IPO not found during update');
        }

        // 7. Audit Log
        await logAdminAction(req.admin?._id, 'UPDATE_IPO', req, {
            slug,
            company: updatedIpo.companyName
        });

        return responseHandler(res, 200, true, updatedIpo, 'IPO Updated Successfully');
    } catch (error) {
        console.error("Update IPO Error:", error);
        if (error.name === 'ZodError') {
            const exactMsg = error.errors.map(e => e.message || e.msg || e).join(', ');
            return res.status(400).json({ success: false, message: exactMsg, errors: error.errors });
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

        // Soft delete: hide from public/admin lists but retain the record
        // (matches the isDeleted/deletedAt design used across the codebase).
        await IpoFull.updateOne(
            { _id: ipo._id },
            { $set: { isDeleted: true, deletedAt: new Date() } }
        );

        await logAdminAction(req.admin._id, 'DELETE_IPO', req, { slug });

        return responseHandler(res, 200, true, null, 'IPO Archived Successfully');
    } catch (error) {
        next(error);
    }
};
