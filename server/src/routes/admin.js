import express from 'express';
import { getDashboardStats, getAllReports, updateReportStatus, getAllUsers, updateUserRole, getAuditLogs, getFlaggedReports, flagReport, unflagReport } from '../controllers/adminController.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.get('/dashboard', authenticate, requireAdmin, getDashboardStats);
router.get('/reports', authenticate, requireAdmin, getAllReports);
router.put('/reports/:id/status', authenticate, requireAdmin, updateReportStatus);
router.get('/reports/flagged', authenticate, requireAdmin, getFlaggedReports);
router.put('/reports/:id/flag', authenticate, requireAdmin, flagReport);
router.put('/reports/:id/unflag', authenticate, requireAdmin, unflagReport);
router.get('/users', authenticate, requireAdmin, getAllUsers);
router.put('/users/:id/role', authenticate, requireAdmin, updateUserRole);
router.get('/audit-logs', authenticate, requireAdmin, getAuditLogs);

export default router;
