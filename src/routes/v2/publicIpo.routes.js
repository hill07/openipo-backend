import express from 'express';
import { getIpos, getIpo, getIpoNote, getIpoSubscription } from '../../controllers/v2/publicIpo.controller.js';

const router = express.Router();

router.get('/', getIpos);
router.get('/:slug', getIpo);
router.get('/:slug/note', getIpoNote);
router.get('/:slug/subscription', getIpoSubscription);

export default router;
