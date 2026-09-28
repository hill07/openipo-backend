import express from 'express';
import { deleteUser, getUsers, setUserPassword } from '../../controllers/v2/adminUser.controller.js';
import { protectAdmin } from '../../middlewares/adminAuth.middleware.js';

const router = express.Router();

router.get('/', protectAdmin, getUsers);
router.put('/:id/password', protectAdmin, setUserPassword);
router.delete('/:id', protectAdmin, deleteUser);

export default router;
