import express from 'express';
import { getFoundFeed } from '../controllers/foundFeedController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticate, getFoundFeed);

export default router;