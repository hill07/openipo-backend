import express from 'express';
import { getVisitorCount } from '../controllers/visitor.controller.js';

const router = express.Router();

router.post('/count', getVisitorCount);

export default router;
