import express from 'express';
import { createCategory, getCategories, deleteCategory } from '../controllers/categoryController.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.post('/', authenticate, requireAdmin, createCategory);
router.get('/', getCategories);
router.delete('/:id', authenticate, requireAdmin, deleteCategory);

export default router;
