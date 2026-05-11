import express from 'express';
import Settings from '../../models/Settings.js';
import { responseHandler } from '../../utils/responseHandler.js';
import { protectAdmin } from '../../middlewares/adminAuth.middleware.js';

const router = express.Router();

// @desc    Get Global Settings
// @route   GET /api/v2/settings
// @access  Public or Admin (we'll make it open to get, secure to update)
router.get('/', async (req, res, next) => {
    try {
        let settings = await Settings.findOne({ key: 'global' });
        if (!settings) {
            settings = await Settings.create({ key: 'global' });
        }
        return responseHandler(res, 200, true, settings);
    } catch (error) {
        next(error);
    }
});

// @desc    Update Global Settings
// @route   PUT /api/v2/settings
// @access  Admin
router.put('/', protectAdmin, async (req, res, next) => {
    try {
        const { showIpoGuru } = req.body;
        
        const settings = await Settings.findOneAndUpdate(
            { key: 'global' },
            { showIpoGuru },
            { new: true, upsert: true }
        );
        
        return responseHandler(res, 200, true, settings);
    } catch (error) {
        next(error);
    }
});

export default router;
