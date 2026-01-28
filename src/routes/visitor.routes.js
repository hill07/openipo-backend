import express from 'express';
import { getVisitorCount } from '../controllers/visitor.controller.js';

const router = express.Router();

router.get('/count', getVisitorCount);

export default router;
