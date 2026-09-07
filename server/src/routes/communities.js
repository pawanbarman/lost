import express from 'express';
import { createCommunity, getCommunities } from '../controllers/communityController.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.post('/', authenticate, requireAdmin, createCommunity);
router.get('/', getCommunities);

export default router;