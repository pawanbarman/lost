import express from 'express';
import { createClaim, getClaims, getClaimById, updateClaimStatus } from '../controllers/claimController.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.post('/', authenticate, createClaim);
router.get('/', authenticate, getClaims);
router.get('/:id', authenticate, getClaimById);
router.put('/:id/status', authenticate, requireAdmin, updateClaimStatus);

export default router;
