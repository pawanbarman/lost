import express from 'express';
import { createClaim, getClaims, getClaimById, updateClaimStatus, updateHandover } from '../controllers/claimController.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.post('/', authenticate, createClaim);
router.get('/', authenticate, getClaims);
router.get('/:id', authenticate, getClaimById);
router.put('/:id/status', authenticate, requireAdmin, updateClaimStatus);
router.put('/:id/handover', authenticate, updateHandover);

export default router;
