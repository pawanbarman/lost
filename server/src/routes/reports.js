import express from 'express';
import { createReport, getReports, getReportById, updateReport, deleteReport, getMyReports } from '../controllers/reportController.js';
import { authenticate } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';

const router = express.Router();

router.post('/', authenticate, upload.single('image'), createReport);
router.get('/', getReports);
router.get('/my', authenticate, getMyReports);
router.get('/:id', authenticate, getReportById);
router.put('/:id', authenticate, updateReport);
router.delete('/:id', authenticate, deleteReport);

export default router;
