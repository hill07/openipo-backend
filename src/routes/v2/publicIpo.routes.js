import express from 'express';
import { getIpos, getIpo, getIpoNote } from '../../controllers/v2/publicIpo.controller.js';

const router = express.Router();

router.get('/', getIpos);
router.get('/:slug', getIpo);
router.get('/:slug/note', getIpoNote);

export default router;
