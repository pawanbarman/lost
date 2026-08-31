import prisma from '../config/database.js';
import { matchingService } from '../services/matchingService.js';

export const getMatches = async (req, res) => {
  try {
    const matches = await matchingService.getMatchesForUser(req.user.id);
    res.json(matches);
  } catch (error) {
    throw error;
  }
};

export const getMatchById = async (req, res) => {
  try {
    const match = await prisma.match.findUnique({
      where: { id: req.params.id },
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

    res.json(match);
  } catch (error) {
    throw error;
  }
};

export const updateMatchStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }
    
    const match = await prisma.match.findUnique({
      where: { id: req.params.id },
      include: {
        lostReport: true,
        foundReport: true
      }
    });

    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }

    if (match.lostReport.userId !== req.user.id && match.foundReport.userId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Not authorized to update this match' });
    }

    const updatedMatch = await prisma.match.update({
      where: { id: req.params.id },
      data: { status },
      include: {
        lostReport: true,
        foundReport: true
      }
    });

    res.json(updatedMatch);
  } catch (error) {
    throw error;
  }
};
