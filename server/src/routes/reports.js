import express from 'express';
import { createReport, getReports, getReportById, getReportMatches, updateReport, deleteReport, getMyReports } from '../controllers/reportController.js';
import { authenticate } from '../middleware/auth.js';
import { upload, uploadToCloudinary } from '../middleware/upload.js';

const router = express.Router();

router.post('/', authenticate, upload.single('image'), uploadToCloudinary, createReport);
router.get('/', getReports);
router.get('/my', authenticate, getMyReports);
router.get('/:id/matches', authenticate, getReportMatches);
router.get('/:id', authenticate, getReportById);
router.put('/:id', authenticate, upload.single('image'), uploadToCloudinary, updateReport);
router.delete('/:id', authenticate, deleteReport);

export default router;
