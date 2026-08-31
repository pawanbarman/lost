import prisma from '../config/database.js';

export const getDashboardStats = async (req, res) => {
  try {
    const [
      totalUsers,
      activeLostReports,
      activeFoundReports,
      possibleMatches,
      pendingClaims,
      returnedItems,
      closedCases
    ] = await Promise.all([
      prisma.user.count(),
      prisma.report.count({ where: { type: 'LOST', status: { in: ['LOST', 'POSSIBLE_MATCH'] } } }),
      prisma.report.count({ where: { type: 'FOUND', status: { in: ['FOUND', 'POSSIBLE_MATCH'] } } }),
      prisma.match.count({ where: { status: 'PENDING' } }),
      prisma.claim.count({ where: { status: 'PENDING' } }),
      prisma.report.count({ where: { status: 'RETURNED' } }),
      prisma.report.count({ where: { status: 'CLOSED' } })
    ]);

    res.json({
      totalUsers,
      activeLostReports,
      activeFoundReports,
      possibleMatches,
      pendingClaims,
      returnedItems,
      closedCases
    });
  } catch (error) {
    throw error;
  }
};

export const getAllReports = async (req, res) => {
  try {
    const { type, status } = req.query;
    
    const where = {};
    if (type) where.type = type;
    if (status) where.status = status;

    const reports = await prisma.report.findMany({
      where,
      include: {
        item: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        event: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(reports);
  } catch (error) {
    throw error;
  }
};

export const updateReportStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['LOST', 'FOUND', 'POSSIBLE_MATCH', 'UNDER_VERIFICATION', 'CLAIMED', 'RETURNED', 'CLOSED'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    const existingReport = await prisma.report.findUnique({
      where: { id: req.params.id }
    });

    if (!existingReport) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const invalidTransitions = {
      CLOSED: ['LOST', 'FOUND', 'POSSIBLE_MATCH', 'UNDER_VERIFICATION', 'CLAIMED'],
      RETURNED: ['LOST', 'FOUND', 'POSSIBLE_MATCH']
    };

    if (invalidTransitions[existingReport.status]?.includes(status)) {
      return res.status(400).json({ error: `Cannot change status from ${existingReport.status} to ${status}` });
    }

    const report = await prisma.report.update({
      where: { id: req.params.id },
      data: { status },
      include: {
        item: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'UPDATE_STATUS',
        entityType: 'REPORT',
        entityId: report.id,
        details: `Changed status to ${status}`
      }
    });

    // Notify user
    await prisma.notification.create({
      data: {
        userId: report.userId,
        message: `Your report status has been updated to ${status}`,
        type: 'REPORT_UPDATED'
      }
    });

    res.json(report);
  } catch (error) {
    throw error;
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        _count: {
          select: { reports: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(users);
  } catch (error) {
    throw error;
  }
};

export const updateUserRole = async (req, res) => {
  try {
    const { role } = req.body;
    
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { role }
    });

    res.json(user);
  } catch (error) {
    throw error;
  }
};

export const getAuditLogs = async (req, res) => {
  try {
    const logs = await prisma.auditLog.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    res.json(logs);
  } catch (error) {
    throw error;
  }
};

export const getFlaggedReports = async (req, res) => {
  try {
    const reports = await prisma.report.findMany({
      where: { isFlagged: true },
      include: {
        item: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        event: true
      },
      orderBy: { updatedAt: 'desc' }
    });

    res.json(reports);
  } catch (error) {
    throw error;
  }
};

export const flagReport = async (req, res) => {
  try {
    const { reason } = req.body;

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return res.status(400).json({ error: 'A reason is required to flag a report' });
    }

    const existingReport = await prisma.report.findUnique({
      where: { id: req.params.id }
    });

    if (!existingReport) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const report = await prisma.report.update({
      where: { id: req.params.id },
      data: {
        isFlagged: true,
        flaggedReason: reason.trim()
      },
      include: {
        item: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'FLAG_REPORT',
        entityType: 'REPORT',
        entityId: report.id,
        details: `Flagged report with reason: ${reason.trim()}`
      }
    });

    res.json(report);
  } catch (error) {
    throw error;
  }
};

export const unflagReport = async (req, res) => {
  try {
    const existingReport = await prisma.report.findUnique({
      where: { id: req.params.id }
    });

    if (!existingReport) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const report = await prisma.report.update({
      where: { id: req.params.id },
      data: {
        isFlagged: false,
        flaggedReason: null
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'UNFLAG_REPORT',
        entityType: 'REPORT',
        entityId: report.id,
        details: 'Cleared flag on report'
      }
    });

    res.json(report);
  } catch (error) {
    throw error;
  }
};

