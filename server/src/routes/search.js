import express from 'express';
import prisma from '../config/database.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { q, type, category, location, startDate, endDate, status, sort } = req.query;
    
    const where = {};
    
    if (q) {
      where.OR = [
        { item: { title: { contains: q, mode: 'insensitive' } } },
        { item: { description: { contains: q, mode: 'insensitive' } } },
        { location: { contains: q, mode: 'insensitive' } }
      ];
    }
    
    if (type) where.type = type;
    if (status) where.status = status;
    if (category) where.item = { ...where.item, category };
    if (location) where.location = { contains: location, mode: 'insensitive' };
    
    if (startDate || endDate) {
      where.dateTime = {};
      if (startDate) where.dateTime.gte = new Date(startDate);
      if (endDate) where.dateTime.lte = new Date(endDate);
    }

    let orderBy = { createdAt: 'desc' };
    if (sort === 'oldest') orderBy = { createdAt: 'asc' };
    else if (sort === 'date_desc') orderBy = { dateTime: 'desc' };
    else if (sort === 'date_asc') orderBy = { dateTime: 'asc' };

    const reports = await prisma.report.findMany({
      where,
      include: {
        item: true,
        user: {
          select: {
            id: true,
            name: true
          }
        },
        event: true
      },
      orderBy,
      take: 50
    });

    res.json(reports);
  } catch (error) {
    throw error;
  }
});

export default router;
