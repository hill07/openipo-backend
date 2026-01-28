import express from 'express';
import {
    createIpo,
    getAdminIpos,
    getAdminIpoBySlug,
    updateIpo,
    deleteIpo
} from '../../controllers/v2/adminIpo.controller.js';
import { protectAdmin } from '../../middlewares/adminAuth.middleware.js';

const router = express.Router();

// All routes are protected
router.use(protectAdmin);

router.route('/')
    .get(getAdminIpos)
    .post(createIpo);

router.route('/:slug')
    .get(getAdminIpoBySlug)
    .put(updateIpo)
    .delete(deleteIpo);

export default router;
