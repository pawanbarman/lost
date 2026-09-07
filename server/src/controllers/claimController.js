import prisma from '../config/database.js';
import { claimSchema } from '../validators/claimValidator.js';

const RECOVERED_STATUSES = ['CLAIMED', 'RETURNED', 'CLOSED'];
const HANDOVER_ACTIONS = ['START', 'COMPLETE'];

class ClaimFlowError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

function sanitizeClaimForUser(claim) {
  if (claim && claim.match) {
    for (const key of ['lostReport', 'foundReport']) {
      if (claim.match[key] && claim.match[key].item && claim.match[key].item.privateDetails) {
        delete claim.match[key].item.privateDetails;
      }
    }
  }
  if (claim) {
    delete claim.adminNotes;
  }
  return claim;
}

function matchIncludeForRole(role) {
  const userSelect =
    role === 'ADMIN'
      ? { select: { id: true, name: true, email: true } }
      : { select: { id: true, name: true } };

  return {
    match: {
      include: {
        lostReport: {
          include: {
            item: true,
            user: userSelect
          }
        },
        foundReport: {
          include: {
            item: true,
            user: userSelect
          }
        }
      }
    },
    claimant: {
      select: {
        id: true,
        name: true,
        email: true
      }
    }
  };
}

export const createClaim = async (req, res) => {
  try {
    const validatedData = claimSchema.parse(req.body);

    const match = await prisma.match.findUnique({
      where: { id: validatedData.matchId },
      include: {
        lostReport: {
          include: {
            item: true,
            user: { select: { id: true, name: true } }
          }
        },
        foundReport: {
          include: {
            item: true,
            user: { select: { id: true, name: true } }
          }
        }
      }
    });

    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }

    // Only the owner of the lost item may claim the found item.
    if (match.lostReport.userId !== req.user.id) {
      return res.status(403).json({ error: 'Only the owner of the lost item may claim this match' });
    }

    const foundReport = match.foundReport;

    if (RECOVERED_STATUSES.includes(foundReport.status)) {
      return res.status(400).json({ error: 'This item is no longer available for claiming' });
    }

    if (
      req.user.communityId &&
      foundReport.communityId &&
      req.user.communityId !== foundReport.communityId &&
      req.user.role !== 'ADMIN'
    ) {
      return res.status(403).json({ error: 'Cannot claim an item from a different community' });
    }

    const existingClaim = await prisma.claim.findFirst({
      where: {
        claimantId: req.user.id,
        reportId: foundReport.id
      }
    });

    if (existingClaim) {
      return res.status(400).json({ error: 'You have already submitted a claim for this item' });
    }

    const claim = await prisma.claim.create({
      data: {
        matchId: validatedData.matchId,
        claimantId: req.user.id,
        reportId: foundReport.id,
        verificationDetails: validatedData.verificationDetails
      },
      include: matchIncludeForRole(req.user.role)
    });

    await prisma.notification.create({
      data: {
        userId: req.user.id,
        message: 'Your claim has been submitted and is awaiting admin review.',
        type: 'CLAIM_SUBMITTED'
      }
    });

    await prisma.notification.create({
      data: {
        userId: foundReport.userId,
        message: 'A new claim was submitted for your found item and is awaiting admin review.',
        type: 'CLAIM_SUBMITTED'
      }
    });

    const response = req.user.role === 'ADMIN' ? claim : sanitizeClaimForUser(claim);
    res.status(201).json(response);
  } catch (error) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: error.errors[0].message });
    }
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'You have already submitted a claim for this item' });
    }
    throw error;
  }
};

export const getClaims = async (req, res) => {
  try {
    const claims = await prisma.claim.findMany({
      where: req.user.role === 'ADMIN' ? {} : { claimantId: req.user.id },
      include: matchIncludeForRole(req.user.role),
      orderBy: { createdAt: 'desc' }
    });

    const response = req.user.role === 'ADMIN' ? claims : claims.map(sanitizeClaimForUser);
    res.json(response);
  } catch (error) {
    throw error;
  }
};

export const getClaimById = async (req, res) => {
  try {
    const claim = await prisma.claim.findUnique({
      where: { id: req.params.id },
      include: matchIncludeForRole(req.user.role)
    });

    if (!claim) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    if (claim.claimantId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const response = req.user.role === 'ADMIN' ? claim : sanitizeClaimForUser(claim);
    res.json(response);
  } catch (error) {
    throw error;
  }
};

async function approveClaim(req, res, adminNotes) {
  const updatedClaim = await prisma.$transaction(async (tx) => {
    const claim = await tx.claim.findUnique({
      where: { id: req.params.id },
      include: {
        match: {
          include: {
            lostReport: true,
            foundReport: true
          }
        }
      }
    });

    if (!claim) {
      throw new ClaimFlowError('Claim not found', 404);
    }

    if (claim.status !== 'PENDING') {
      throw new ClaimFlowError('Only pending claims can be approved', 400);
    }

    const foundReport = claim.match.foundReport;
    if (RECOVERED_STATUSES.includes(foundReport.status)) {
      throw new ClaimFlowError('This item has already been claimed or recovered', 400);
    }

    const reportGuard = await tx.report.updateMany({
      where: {
        id: foundReport.id,
        status: { in: ['FOUND', 'POSSIBLE_MATCH', 'UNDER_VERIFICATION'] }
      },
      data: { status: 'CLAIMED' }
    });

    if (reportGuard.count === 0) {
      throw new ClaimFlowError('This item has already been claimed by another claim', 400);
    }

    const claimGuard = await tx.claim.updateMany({
      where: { id: claim.id, status: 'PENDING' },
      data: { status: 'APPROVED', adminNotes: adminNotes || null }
    });

    if (claimGuard.count === 0) {
      throw new ClaimFlowError('This claim was already processed', 400);
    }

    await tx.report.update({
      where: { id: claim.match.lostReportId },
      data: { status: 'UNDER_VERIFICATION' }
    });

    await tx.match.update({
      where: { id: claim.matchId },
      data: { status: 'ACCEPTED' }
    });

    await tx.claim.updateMany({
      where: {
        reportId: foundReport.id,
        status: 'PENDING',
        id: { not: claim.id }
      },
      data: {
        status: 'REJECTED',
        adminNotes: 'Rejected: another claim was approved for this item.'
      }
    });

    await tx.notification.create({
      data: {
        userId: claim.claimantId,
        message: 'Your claim has been approved. The item is ready for handover.',
        type: 'CLAIM_APPROVED'
      }
    });

    await tx.notification.create({
      data: {
        userId: foundReport.userId,
        message: 'A claim was approved for your found item. It is ready for handover.',
        type: 'CLAIM_APPROVED'
      }
    });

    return tx.claim.findFirst({
      where: { id: claim.id },
      include: matchIncludeForRole(req.user.role)
    });
  });

  res.json(updatedClaim);
}

async function rejectClaim(req, res, adminNotes) {
  const updatedClaim = await prisma.$transaction(async (tx) => {
    const claim = await tx.claim.findUnique({
      where: { id: req.params.id },
      include: {
        match: { include: { foundReport: { select: { userId: true } } } }
      }
    });

    if (!claim) {
      throw new ClaimFlowError('Claim not found', 404);
    }

    const guard = await tx.claim.updateMany({
      where: { id: claim.id, status: 'PENDING' },
      data: { status: 'REJECTED', adminNotes: adminNotes || null }
    });

    if (guard.count === 0) {
      throw new ClaimFlowError('Only pending claims can be rejected', 400);
    }

    await tx.notification.create({
      data: {
        userId: claim.claimantId,
        message: 'Your claim has been rejected.',
        type: 'CLAIM_REJECTED'
      }
    });

    return tx.claim.findFirst({
      where: { id: claim.id },
      include: matchIncludeForRole(req.user.role)
    });
  });

  res.json(updatedClaim);
}

export const updateClaimStatus = async (req, res) => {
  const { status, adminNotes } = req.body;
  const normalized = String(status || '').toUpperCase();

  if (normalized !== 'APPROVED' && normalized !== 'REJECTED') {
    return res.status(400).json({
      error: 'Invalid status. Use APPROVED or REJECTED to review a claim. Handover steps use /handover.'
    });
  }

  try {
    if (normalized === 'APPROVED') {
      return await approveClaim(req, res, adminNotes);
    }
    return await rejectClaim(req, res, adminNotes);
  } catch (error) {
    if (error instanceof ClaimFlowError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    throw error;
  }
};

export const updateHandover = async (req, res) => {
  const action = String(req.body.action || '').toUpperCase();

  if (!HANDOVER_ACTIONS.includes(action)) {
    return res.status(400).json({ error: 'Invalid handover action. Use START or COMPLETE.' });
  }

  try {
    const updatedClaim = await prisma.$transaction(async (tx) => {
      const claim = await tx.claim.findUnique({
        where: { id: req.params.id },
        include: {
          match: {
            include: {
              lostReport: true,
              foundReport: true
            }
          }
        }
      });

      if (!claim) {
        throw new ClaimFlowError('Claim not found', 404);
      }

      const isAdminUser = req.user.role === 'ADMIN';
      const isClaimant = claim.claimantId === req.user.id;
      const isFinder = claim.match.foundReport.userId === req.user.id;

      if (!isAdminUser && !isClaimant && !isFinder) {
        throw new ClaimFlowError('You are not authorized to manage this handover', 403);
      }

      if (action === 'START') {
        const guard = await tx.claim.updateMany({
          where: { id: claim.id, status: 'APPROVED' },
          data: { status: 'UNDER_HANDOVER', handoverStartedAt: new Date() }
        });

        if (guard.count === 0) {
          throw new ClaimFlowError('Only approved claims can start a handover', 400);
        }

        await tx.notification.create({
          data: {
            userId: claim.claimantId,
            message: 'Handover has been initiated. Review the pickup location to receive your item.',
            type: 'SYSTEM'
          }
        });

        await tx.notification.create({
          data: {
            userId: claim.match.foundReport.userId,
            message: 'Handover has been initiated for the item you found. Arrange the pickup.',
            type: 'SYSTEM'
          }
        });
      } else {
        const guard = await tx.claim.updateMany({
          where: { id: claim.id, status: 'UNDER_HANDOVER' },
          data: { status: 'COMPLETED', handoverCompletedAt: new Date() }
        });

        if (guard.count === 0) {
          throw new ClaimFlowError('Only handovers in progress can be completed', 400);
        }

        await tx.report.update({
          where: { id: claim.match.lostReportId },
          data: { status: 'RETURNED' }
        });

        await tx.report.update({
          where: { id: claim.match.foundReportId },
          data: { status: 'RETURNED' }
        });

        await tx.notification.create({
          data: {
            userId: claim.claimantId,
            message: 'Your item has been successfully recovered. Handover complete.',
            type: 'ITEM_RETURNED'
          }
        });

        await tx.notification.create({
          data: {
            userId: claim.match.foundReport.userId,
            message: 'The item you found has been returned to its owner. Handover complete.',
            type: 'ITEM_RETURNED'
          }
        });
      }

      return tx.claim.findFirst({
        where: { id: claim.id },
        include: matchIncludeForRole(req.user.role)
      });
    });

    const response = req.user.role === 'ADMIN' ? updatedClaim : sanitizeClaimForUser(updatedClaim);
    res.json(response);
  } catch (error) {
    if (error instanceof ClaimFlowError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    throw error;
  }
};