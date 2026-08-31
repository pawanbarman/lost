import prisma from '../config/database.js';
import { claimSchema } from '../validators/claimValidator.js';

export const createClaim = async (req, res) => {
  try {
    const validatedData = claimSchema.parse(req.body);
    
    const match = await prisma.match.findUnique({
      where: { id: validatedData.matchId },
      include: {
        lostReport: true,
        foundReport: true
      }
    });

    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }

    // Check if user is involved in the match
    const isLostOwner = match.lostReport.userId === req.user.id;
    const isFoundOwner = match.foundReport.userId === req.user.id;

    if (!isLostOwner && !isFoundOwner) {
      return res.status(403).json({ error: 'You are not authorized to claim this match' });
    }

    const targetReportId = isLostOwner ? match.foundReportId : match.lostReportId;

    // Check if claim already exists
    const existingClaim = await prisma.claim.findFirst({
      where: {
        matchId: validatedData.matchId,
        claimantId: req.user.id
      }
    });

    if (existingClaim) {
      return res.status(400).json({ error: 'You have already submitted a claim for this match' });
    }

    const claim = await prisma.claim.create({
      data: {
        matchId: validatedData.matchId,
        claimantId: req.user.id,
        reportId: targetReportId,
        verificationDetails: validatedData.verificationDetails
      },
      include: {
        match: {
          include: {
            lostReport: {
              include: { item: true }
            },
            foundReport: {
              include: { item: true }
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
      }
    });

    // Notify the other party
    const otherUserId = isLostOwner ? match.foundReport.userId : match.lostReport.userId;
    
    await prisma.notification.create({
      data: {
        userId: otherUserId,
        message: `Someone submitted a claim for a matched item`,
        type: 'CLAIM_SUBMITTED'
      }
    });

    res.status(201).json(claim);
  } catch (error) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: error.errors[0].message });
    }
    throw error;
  }
};

export const getClaims = async (req, res) => {
  try {
    const claims = await prisma.claim.findMany({
      where: req.user.role === 'ADMIN' ? {} : { claimantId: req.user.id },
      include: {
        match: {
          include: {
            lostReport: {
              include: { item: true }
            },
            foundReport: {
              include: { item: true }
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
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(claims);
  } catch (error) {
    throw error;
  }
};

export const getClaimById = async (req, res) => {
  try {
    const claim = await prisma.claim.findUnique({
      where: { id: req.params.id },
      include: {
        match: {
          include: {
            lostReport: {
              include: { item: true, user: true }
            },
            foundReport: {
              include: { item: true, user: true }
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
      }
    });

    if (!claim) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    // Only admin or claimant can see full details
    if (claim.claimantId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    res.json(claim);
  } catch (error) {
    throw error;
  }
};

export const updateClaimStatus = async (req, res) => {
  try {
    const { status, adminNotes } = req.body;
    
    const claim = await prisma.claim.findUnique({
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
      return res.status(404).json({ error: 'Claim not found' });
    }

    const updatedClaim = await prisma.claim.update({
      where: { id: req.params.id },
      data: {
        status,
        adminNotes
      },
      include: {
        match: {
          include: {
            lostReport: true,
            foundReport: true
          }
        }
      }
    });

    // Update report statuses based on claim status
    if (status === 'APPROVED') {
      await prisma.report.update({
        where: { id: claim.match.lostReportId },
        data: { status: 'UNDER_VERIFICATION' }
      });

      await prisma.report.update({
        where: { id: claim.match.foundReportId },
        data: { status: 'CLAIMED' }
      });

      // Notify claimant
      await prisma.notification.create({
        data: {
          userId: claim.claimantId,
          message: 'Your claim has been approved. Verification in progress.',
          type: 'CLAIM_APPROVED'
        }
      });
    } else if (status === 'REJECTED') {
      await prisma.notification.create({
        data: {
          userId: claim.claimantId,
          message: 'Your claim has been rejected.',
          type: 'CLAIM_REJECTED'
        }
      });
    }

    res.json(updatedClaim);
  } catch (error) {
    throw error;
  }
};
