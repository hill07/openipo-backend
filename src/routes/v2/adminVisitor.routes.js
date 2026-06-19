import express from 'express';
import { getAdminVisitors } from '../../controllers/visitor.controller.js';
import { protectAdmin } from '../../middlewares/adminAuth.middleware.js';

const router = express.Router();

router.get('/', protectAdmin, getAdminVisitors);

export default router;
