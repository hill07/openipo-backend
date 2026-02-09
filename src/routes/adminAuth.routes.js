import express from 'express';
import {
    loginStep1,
    verify2FA,
    logout,
    getMe,
    setup2FA,
    confirm2FA,
    changePassword
} from '../controllers/adminAuth.controller.js';
import { protectAdmin } from '../middlewares/adminAuth.middleware.js';

const router = express.Router();

// Public
router.post('/login', loginStep1);
router.post('/verify-2fa', verify2FA);
router.post('/logout', logout);

// Protected (or Semi-protected)
router.get('/me', protectAdmin, getMe);
router.post('/2fa/setup', setup2FA); // Handles both logged-in and pre-2fa logic
router.post('/2fa/confirm', confirm2FA);
router.put('/password', protectAdmin, changePassword);

export default router;
