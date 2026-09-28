import express from 'express';
import {
    addExcludedIp,
    deleteVisitor,
    getAdminVisitors,
    getExcludedIps,
    getMyIp,
    removeExcludedIp,
} from '../../controllers/visitor.controller.js';
import { protectAdmin } from '../../middlewares/adminAuth.middleware.js';

const router = express.Router();

router.get('/', protectAdmin, getAdminVisitors);
router.get('/my-ip', protectAdmin, getMyIp);
router.get('/excluded', protectAdmin, getExcludedIps);
router.post('/excluded', protectAdmin, addExcludedIp);
router.delete('/excluded/:id', protectAdmin, removeExcludedIp);
router.delete('/:id', protectAdmin, deleteVisitor);

export default router;
