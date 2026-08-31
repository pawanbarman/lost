import express from 'express';
import { getMatches, getMatchById, updateMatchStatus } from '../controllers/matchController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticate, getMatches);
router.get('/:id', authenticate, getMatchById);
router.put('/:id/status', authenticate, updateMatchStatus);

export default router;
